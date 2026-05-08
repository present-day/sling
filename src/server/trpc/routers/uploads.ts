import { createId } from "@paralleldrive/cuid2"
import { TRPCError } from "@trpc/server"
import { and, desc, eq } from "drizzle-orm"
import { z } from "zod"
import { documentUploads } from "@/server/db/schema"
import { ensureClientInOrg } from "@/server/trpc/ensure-client-in-org"
import {
	classifyDocument,
	FileTooLargeError,
	isSupportedMime,
	UnsupportedMimeError,
} from "@/server/uploads/classify"
import { ENTITY_KIND_VALUES } from "@/server/uploads/entity-kinds"
import { persistUpload } from "@/server/uploads/storage"
import { orgProcedure, router } from "../init"

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
			return { ok: true as const }
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
