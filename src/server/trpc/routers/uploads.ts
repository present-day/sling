import { createId } from "@paralleldrive/cuid2"
import { TRPCError } from "@trpc/server"
import { and, desc, eq } from "drizzle-orm"
import { z } from "zod"
import { documentUploads } from "@/server/db/schema"
import {
	describeIntuitFault,
	IntuitApiError,
	makeIntuitClient,
} from "@/server/qbo/intuit-client"
import { ensureClientInOrg } from "@/server/trpc/ensure-client-in-org"
import {
	classifyDocument,
	FileTooLargeError,
	isSupportedMime,
	UnsupportedMimeError,
} from "@/server/uploads/classify"
import {
	type CommitPayload,
	CommitPreconditionError,
	commitUpload,
} from "@/server/uploads/commit"
import { ENTITY_KIND_VALUES, EntityKind } from "@/server/uploads/entity-kinds"
import {
	applyResolutions,
	RefRole,
	type ResolutionDecision,
	resolveRefs,
} from "@/server/uploads/resolve-refs"
import { persistUpload } from "@/server/uploads/storage"
import {
	type DocumentDraft,
	translateDocument,
} from "@/server/uploads/translators"
import {
	billDraftSchema,
	customerDraftSchema,
	invoiceDraftSchema,
	salesReceiptDraftSchema,
	TranslatorInputError,
	vendorDraftSchema,
} from "@/server/uploads/translators/types"
import { orgProcedure, router } from "../init"

/**
 * Result of asking the server to draft a payload for the chosen kind, given the
 * stored classification. Returned by `chooseEntity` so the client can chain a
 * `commit` call without having to host the (server-only) translators itself.
 *
 * Committable kinds (those with a matching `.create.ts` under `server/qbo/`):
 * SalesReceipt, Invoice, Customer, Bill, Vendor. Estimate has a draft shape
 * but no creator yet, so it surfaces as `kind_not_translatable`.
 */
export type CommittableDraft = Extract<
	DocumentDraft,
	{ kind: "SalesReceipt" | "Invoice" | "Customer" | "Bill" | "Vendor" }
>

export type DraftForChoiceResult =
	| CommittableDraft
	| { kind: null; reason: "missing_fields"; missing: readonly string[] }
	| { kind: null; reason: "kind_not_translatable" }

function draftForChoice(
	classificationJson: unknown,
	entityKind: string,
): DraftForChoiceResult {
	const candidates = extractCandidatesArray(classificationJson)
	const candidate =
		candidates.find(
			(
				c,
			): c is {
				entityKind: string
				extractedFields: Record<string, unknown>
			} =>
				typeof c === "object" &&
				c !== null &&
				(c as { entityKind?: unknown }).entityKind === entityKind,
		) ?? candidates[0]
	const fields =
		(candidate as { extractedFields?: Record<string, unknown> } | undefined)
			?.extractedFields ?? {}

	try {
		const draft = translateDocument(entityKind, fields)
		if (!draft) return { kind: null, reason: "kind_not_translatable" }
		// Switch on `draft.kind` to preserve the discriminated-union narrowing:
		// reconstructing the object as `{ kind: draft.kind, payload: draft.payload }`
		// collapses to the cross-product type, which the tRPC return type rejects.
		switch (draft.kind) {
			case EntityKind.salesReceipt:
				return { kind: draft.kind, payload: draft.payload }
			case EntityKind.invoice:
				return { kind: draft.kind, payload: draft.payload }
			case EntityKind.customer:
				return { kind: draft.kind, payload: draft.payload }
			case EntityKind.bill:
				return { kind: draft.kind, payload: draft.payload }
			case EntityKind.vendor:
				return { kind: draft.kind, payload: draft.payload }
			default:
				return { kind: null, reason: "kind_not_translatable" }
		}
	} catch (e) {
		if (e instanceof TranslatorInputError) {
			return { kind: null, reason: "missing_fields", missing: e.missing }
		}
		throw e
	}
}

function extractCandidatesArray(classificationJson: unknown): unknown[] {
	if (
		classificationJson &&
		typeof classificationJson === "object" &&
		Array.isArray((classificationJson as { candidates?: unknown }).candidates)
	) {
		return (classificationJson as { candidates: unknown[] }).candidates
	}
	return []
}

const commitPayloadSchema = z.discriminatedUnion("entityKind", [
	z.object({
		entityKind: z.literal(EntityKind.salesReceipt),
		payload: salesReceiptDraftSchema,
	}),
	z.object({
		entityKind: z.literal(EntityKind.invoice),
		payload: invoiceDraftSchema,
	}),
	z.object({
		entityKind: z.literal(EntityKind.customer),
		payload: customerDraftSchema,
	}),
	z.object({
		entityKind: z.literal(EntityKind.bill),
		payload: billDraftSchema,
	}),
	z.object({
		entityKind: z.literal(EntityKind.vendor),
		payload: vendorDraftSchema,
	}),
])

const resolutionDecisionSchema = z.object({
	role: z.enum([RefRole.customer, RefRole.vendor]),
	choice: z.discriminatedUnion("kind", [
		z.object({ kind: z.literal("existing"), value: z.string().min(1) }),
		z.object({ kind: z.literal("create_new"), name: z.string().min(1) }),
	]),
})

const resolveRefsInput = z.object({
	clientId: z.string(),
	commit: commitPayloadSchema,
})

const commitInput = z.object({
	uploadId: z.string(),
	clientId: z.string(),
	commit: commitPayloadSchema,
	resolutions: z.array(resolutionDecisionSchema).optional(),
})

const classifyInput = z.object({
	clientId: z.string(),
	fileName: z.string().min(1).max(512),
	mime: z.string().min(1).max(255),
	/** Base64-encoded file bytes. */
	dataBase64: z.string().min(1),
})

export const uploadsRouter = router({
	classify: orgProcedure
		.input(classifyInput)
		.mutation(async ({ ctx, input }) => {
			await ensureClientInOrg(ctx.orgId, input.clientId)
			if (!isSupportedMime(input.mime)) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: `Unsupported file type: ${input.mime}`,
				})
			}

			const bytes = Buffer.from(input.dataBase64, "base64")
			const uploadId = createId()
			const storagePath = await persistUpload(
				ctx.orgId,
				uploadId,
				input.mime,
				bytes,
			)

			await ctx.db.insert(documentUploads).values({
				id: uploadId,
				orgId: ctx.orgId,
				clientId: input.clientId,
				uploaderId: ctx.session.user.id,
				fileName: input.fileName,
				mime: input.mime,
				byteLength: bytes.length,
				storagePath,
				status: "pending",
			})

			let classification: Awaited<ReturnType<typeof classifyDocument>>
			try {
				classification = await classifyDocument({
					bytes,
					mime: input.mime,
					fileName: input.fileName,
				})
			} catch (e) {
				await ctx.db
					.update(documentUploads)
					.set({ status: "failed" })
					.where(eq(documentUploads.id, uploadId))
				if (e instanceof UnsupportedMimeError) {
					throw new TRPCError({ code: "BAD_REQUEST", message: e.message })
				}
				if (e instanceof FileTooLargeError) {
					throw new TRPCError({
						code: "PAYLOAD_TOO_LARGE",
						message: e.message,
					})
				}
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to classify document",
					cause: e,
				})
			}

			await ctx.db
				.update(documentUploads)
				.set({
					classificationJson: classification,
					status: "classified",
				})
				.where(eq(documentUploads.id, uploadId))

			return { uploadId, classification }
		}),

	chooseEntity: orgProcedure
		.input(
			z.object({
				uploadId: z.string(),
				entityKind: z.enum(ENTITY_KIND_VALUES as [string, ...string[]]),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const row = await ctx.db.query.documentUploads.findFirst({
				where: (u, { eq: eqFn, and: andFn }) =>
					andFn(eqFn(u.id, input.uploadId), eqFn(u.orgId, ctx.orgId)),
			})
			if (!row) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Upload not found",
				})
			}
			await ctx.db
				.update(documentUploads)
				.set({ chosenEntityKind: input.entityKind })
				.where(eq(documentUploads.id, input.uploadId))

			const draft = draftForChoice(row.classificationJson, input.entityKind)
			return { ok: true as const, draft }
		}),

	abandon: orgProcedure
		.input(z.object({ uploadId: z.string() }))
		.mutation(async ({ ctx, input }) => {
			await ctx.db
				.update(documentUploads)
				.set({ status: "abandoned" })
				.where(
					and(
						eq(documentUploads.id, input.uploadId),
						eq(documentUploads.orgId, ctx.orgId),
					),
				)
			return { ok: true as const }
		}),

	resolveRefs: orgProcedure
		.input(resolveRefsInput)
		.mutation(async ({ ctx, input }) => {
			const client = await ensureClientInOrg(ctx.orgId, input.clientId)
			const intuit = makeIntuitClient(client)
			try {
				return await resolveRefs({
					commit: input.commit as CommitPayload,
					intuit,
				})
			} catch (e) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message:
						e instanceof Error ? e.message : "Failed to resolve QBO refs",
					cause: e,
				})
			}
		}),

	commit: orgProcedure.input(commitInput).mutation(async ({ ctx, input }) => {
		const client = await ensureClientInOrg(ctx.orgId, input.clientId)
		const upload = await ctx.db.query.documentUploads.findFirst({
			where: (u, { eq: eqFn, and: andFn }) =>
				andFn(eqFn(u.id, input.uploadId), eqFn(u.orgId, ctx.orgId)),
		})
		if (!upload) {
			throw new TRPCError({
				code: "NOT_FOUND",
				message: "Upload not found",
			})
		}
		if (upload.clientId !== input.clientId) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Upload does not belong to this client",
			})
		}

		const intuit = makeIntuitClient(client)
		let finalCommit = input.commit as CommitPayload
		if (input.resolutions && input.resolutions.length > 0) {
			try {
				finalCommit = await applyResolutions({
					commit: finalCommit,
					resolutions: input.resolutions as ResolutionDecision[],
					client,
					intuit,
				})
			} catch (e) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message:
						e instanceof Error ? e.message : "Failed to apply ref resolutions",
					cause: e,
				})
			}
		}

		try {
			return await commitUpload({
				client,
				upload,
				commit: finalCommit,
				intuit,
			})
		} catch (e) {
			if (e instanceof CommitPreconditionError) {
				throw new TRPCError({ code: "BAD_REQUEST", message: e.message })
			}
			// QBO rejected the write (validation fault). Surface the actual
			// Intuit Error[].Detail so the wizard shows why, not just HTTP 400.
			if (e instanceof IntuitApiError) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: describeIntuitFault(e),
					cause: e,
				})
			}
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message:
					e instanceof Error ? e.message : "Failed to commit upload to QBO",
				cause: e,
			})
		}
		// TODO(#28): write audit-log entry once the audit table lands.
	}),

	listForClient: orgProcedure
		.input(
			z.object({
				clientId: z.string(),
				limit: z.number().max(100).default(25),
			}),
		)
		.query(async ({ ctx, input }) => {
			await ensureClientInOrg(ctx.orgId, input.clientId)
			return ctx.db
				.select()
				.from(documentUploads)
				.where(
					and(
						eq(documentUploads.orgId, ctx.orgId),
						eq(documentUploads.clientId, input.clientId),
					),
				)
				.orderBy(desc(documentUploads.createdAt))
				.limit(input.limit)
		}),
})
