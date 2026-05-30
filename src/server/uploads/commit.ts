import "server-only"
import { eq } from "drizzle-orm"
import { db } from "@/server/db/client"
import type { clients, documentUploads } from "@/server/db/schema"
import { documentUploads as documentUploadsTable } from "@/server/db/schema"
import { createBill } from "@/server/qbo/bill.create"
import { createCustomer } from "@/server/qbo/customer.create"
import { IntuitApiError, type IntuitClient } from "@/server/qbo/intuit-client"
import { createInvoice } from "@/server/qbo/invoice.create"
import { createSalesReceipt } from "@/server/qbo/sales-receipt.create"
import { createVendor } from "@/server/qbo/vendor.create"
import { EntityKind } from "@/server/uploads/entity-kinds"
import { readUpload } from "@/server/uploads/storage"
import type {
	BillDraft,
	CustomerDraft,
	InvoiceDraft,
	SalesReceiptDraft,
	VendorDraft,
} from "@/server/uploads/translators/types"

type ClientRow = typeof clients.$inferSelect
type UploadRow = typeof documentUploads.$inferSelect

export type CommitPayload =
	| { entityKind: typeof EntityKind.salesReceipt; payload: SalesReceiptDraft }
	| { entityKind: typeof EntityKind.invoice; payload: InvoiceDraft }
	| { entityKind: typeof EntityKind.customer; payload: CustomerDraft }
	| { entityKind: typeof EntityKind.bill; payload: BillDraft }
	| { entityKind: typeof EntityKind.vendor; payload: VendorDraft }

export type CommitResult =
	| {
			status: "created"
			createdEntityId: string
			qboAttachableId: string
			entityHref: string
	  }
	| {
			status: "created_no_attachment"
			createdEntityId: string
			entityHref: string
			warning: { stage: "attachable"; intuitFault: unknown; httpStatus: number }
	  }

const QBO_HOST: Record<ClientRow["environment"], string> = {
	sandbox: "https://app.sandbox.qbo.intuit.com",
	production: "https://app.qbo.intuit.com",
}

const ENTITY_HREF_PATH: Record<
	CommitPayload["entityKind"],
	{ path: string; idKey: "txnid" | "nameId" }
> = {
	[EntityKind.salesReceipt]: { path: "salesreceipt", idKey: "txnid" },
	[EntityKind.invoice]: { path: "invoice", idKey: "txnid" },
	[EntityKind.bill]: { path: "bill", idKey: "txnid" },
	[EntityKind.customer]: { path: "customerdetail", idKey: "nameId" },
	[EntityKind.vendor]: { path: "vendordetail", idKey: "nameId" },
}

/**
 * Deep-link into the QBO web UI for a freshly-created entity. Sandbox vs
 * production host is keyed off the client row; entity URL stem and id
 * parameter name vary per kind (lowercase txnid for transactions — QBO's
 * router is case-sensitive and ignores txnId — nameId for name-list
 * entities).
 */
export function buildEntityHref(
	environment: ClientRow["environment"],
	entityKind: CommitPayload["entityKind"],
	entityId: string,
): string {
	const host = QBO_HOST[environment]
	const { path, idKey } = ENTITY_HREF_PATH[entityKind]
	return `${host}/app/${path}?${idKey}=${encodeURIComponent(entityId)}`
}

/**
 * Side-effects the commit pipeline needs to perform on the upload row, factored
 * out so tests can supply an in-memory fake instead of standing up a sqlite db.
 */
export interface UploadCommitStore {
	markCreated(
		uploadId: string,
		patch: {
			createdEntityId: string
			qboAttachableId: string | null
			postedAt: Date
			lastError: string | null
		},
	): Promise<void>
	markFailed(uploadId: string, lastError: string): Promise<void>
}

export const dbUploadCommitStore: UploadCommitStore = {
	async markCreated(uploadId, patch) {
		await db
			.update(documentUploadsTable)
			.set({
				status: "created",
				createdEntityId: patch.createdEntityId,
				qboAttachableId: patch.qboAttachableId,
				postedAt: patch.postedAt,
				lastError: patch.lastError,
			})
			.where(eq(documentUploadsTable.id, uploadId))
	},
	async markFailed(uploadId, lastError) {
		await db
			.update(documentUploadsTable)
			.set({ status: "failed", lastError })
			.where(eq(documentUploadsTable.id, uploadId))
	},
}

export class CommitPreconditionError extends Error {
	constructor(
		public readonly code:
			| "WRONG_STATUS"
			| "MISSING_ENTITY_KIND"
			| "KIND_MISMATCH"
			| "UNSUPPORTED_KIND",
		message: string,
	) {
		super(message)
		this.name = "CommitPreconditionError"
	}
}

/**
 * Core upload-commit pipeline. Pulled out of the tRPC layer so tests can pass
 * a fake `IntuitClient` instead of mocking `fetch` end-to-end.
 *
 * Failure semantics, per #56 acceptance:
 *  - Entity create fails  → row status='failed', lastError = structured fault
 *  - Attachable fails after entity succeeded → row status='created' with a
 *    warning in lastError; createdEntityId is set, qboAttachableId is null.
 *  - Both succeed → row status='created', both ids set, postedAt = now.
 */
export async function commitUpload(args: {
	client: ClientRow
	upload: UploadRow
	commit: CommitPayload
	intuit: IntuitClient
	store?: UploadCommitStore
	readFile?: (storagePath: string) => Promise<Buffer>
}): Promise<CommitResult> {
	const {
		client,
		upload,
		commit,
		intuit,
		store = dbUploadCommitStore,
		readFile = readUpload,
	} = args
	assertPreconditions(upload, commit)

	let created: { id: string }
	try {
		created = await dispatchCreate(client, commit, intuit)
	} catch (e) {
		await store.markFailed(upload.id, JSON.stringify(serializeEntityFailure(e)))
		throw e
	}

	const bytes = await readFile(upload.storagePath)
	try {
		const att = await intuit.uploadAttachable({
			fileName: upload.fileName,
			mime: upload.mime,
			bytes,
			attachable: {
				FileName: upload.fileName,
				ContentType: upload.mime,
				AttachableRef: [
					{
						EntityRef: { type: commit.entityKind, value: created.id },
						IncludeOnSend: false,
					},
				],
			},
		})
		await store.markCreated(upload.id, {
			createdEntityId: created.id,
			qboAttachableId: att.Id,
			postedAt: new Date(),
			lastError: null,
		})
		return {
			status: "created",
			createdEntityId: created.id,
			qboAttachableId: att.Id,
			entityHref: buildEntityHref(
				client.environment,
				commit.entityKind,
				created.id,
			),
		}
	} catch (e) {
		const warning = serializeAttachableWarning(e)
		await store.markCreated(upload.id, {
			createdEntityId: created.id,
			qboAttachableId: null,
			postedAt: new Date(),
			lastError: JSON.stringify(warning),
		})
		return {
			status: "created_no_attachment",
			createdEntityId: created.id,
			entityHref: buildEntityHref(
				client.environment,
				commit.entityKind,
				created.id,
			),
			warning,
		}
	}
}

function assertPreconditions(upload: UploadRow, commit: CommitPayload): void {
	if (upload.status !== "classified") {
		throw new CommitPreconditionError(
			"WRONG_STATUS",
			`Upload status must be 'classified' to commit (was '${upload.status}').`,
		)
	}
	if (!upload.chosenEntityKind) {
		throw new CommitPreconditionError(
			"MISSING_ENTITY_KIND",
			"Upload has no chosenEntityKind. Call uploads.chooseEntity first.",
		)
	}
	if (upload.chosenEntityKind !== commit.entityKind) {
		throw new CommitPreconditionError(
			"KIND_MISMATCH",
			`Payload entityKind '${commit.entityKind}' does not match upload's chosenEntityKind '${upload.chosenEntityKind}'.`,
		)
	}
}

function dispatchCreate(
	client: ClientRow,
	commit: CommitPayload,
	intuit: IntuitClient,
): Promise<{ id: string }> {
	switch (commit.entityKind) {
		case EntityKind.salesReceipt:
			return createSalesReceipt(client, commit.payload, intuit)
		case EntityKind.invoice:
			return createInvoice(client, commit.payload, intuit)
		case EntityKind.customer:
			return createCustomer(client, commit.payload, intuit)
		case EntityKind.bill:
			return createBill(client, commit.payload, intuit)
		case EntityKind.vendor:
			return createVendor(client, commit.payload, intuit)
	}
}

function serializeEntityFailure(err: unknown): Record<string, unknown> {
	if (err instanceof IntuitApiError) {
		return {
			stage: "entity_create",
			httpStatus: err.status,
			endpoint: err.endpoint,
			intuitFault: err.intuitFault,
		}
	}
	return {
		stage: "entity_create",
		message: err instanceof Error ? err.message : String(err),
	}
}

function serializeAttachableWarning(err: unknown): {
	stage: "attachable"
	intuitFault: unknown
	httpStatus: number
} {
	if (err instanceof IntuitApiError) {
		return {
			stage: "attachable",
			httpStatus: err.status,
			intuitFault: err.intuitFault,
		}
	}
	return {
		stage: "attachable",
		httpStatus: 0,
		intuitFault: { message: err instanceof Error ? err.message : String(err) },
	}
}
