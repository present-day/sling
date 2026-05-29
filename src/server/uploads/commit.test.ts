import { describe, expect, it, vi } from "vitest"

// Stub the DB client before any module-under-test is imported. commit.ts pulls
// intuit-client.ts, which transitively imports @/server/db/client and would
// otherwise open .data/console.db on import — that path doesn't exist in CI.
// Tests use an injected UploadCommitStore, so the real `db` is never called.
vi.mock("@/server/db/client", () => ({
	db: {
		update: vi.fn().mockReturnValue({
			set: vi.fn().mockReturnValue({
				where: vi.fn().mockResolvedValue(undefined),
			}),
		}),
	},
}))

import type { clients, documentUploads } from "@/server/db/schema"
import { IntuitApiError, type IntuitClient } from "@/server/qbo/intuit-client"
import {
	type CommitPayload,
	CommitPreconditionError,
	commitUpload,
	type UploadCommitStore,
} from "@/server/uploads/commit"
import { EntityKind } from "@/server/uploads/entity-kinds"

type ClientRow = typeof clients.$inferSelect
type UploadRow = typeof documentUploads.$inferSelect

function fakeClient(): ClientRow {
	return {
		id: "client_1",
		orgId: "org_1",
		name: "Acme",
		realmId: "9999",
		environment: "sandbox",
		encryptedRefreshToken: "x",
		tokenUpdatedAt: new Date("2026-01-01"),
		createdAt: new Date("2026-01-01"),
	}
}

function fakeUpload(overrides: Partial<UploadRow> = {}): UploadRow {
	return {
		id: "upl_1",
		orgId: "org_1",
		clientId: "client_1",
		uploaderId: "user_1",
		fileName: "receipt.pdf",
		mime: "application/pdf",
		byteLength: 12,
		storagePath: "/tmp/upl_1.pdf",
		classificationJson: null,
		chosenEntityKind: EntityKind.salesReceipt,
		createdEntityId: null,
		qboAttachableId: null,
		lastError: null,
		postedAt: null,
		status: "classified",
		createdAt: new Date("2026-05-01"),
		...overrides,
	}
}

function fakeStore(): UploadCommitStore & {
	created: Array<{ uploadId: string; patch: Record<string, unknown> }>
	failed: Array<{ uploadId: string; lastError: string }>
} {
	const created: Array<{ uploadId: string; patch: Record<string, unknown> }> =
		[]
	const failed: Array<{ uploadId: string; lastError: string }> = []
	return {
		created,
		failed,
		async markCreated(uploadId, patch) {
			created.push({ uploadId, patch })
		},
		async markFailed(uploadId, lastError) {
			failed.push({ uploadId, lastError })
		},
	}
}

const salesReceiptCommit: CommitPayload = {
	entityKind: EntityKind.salesReceipt,
	payload: {
		Line: [
			{
				DetailType: "SalesItemLineDetail",
				Amount: 42,
				Description: "Coffee",
			},
		],
		TotalAmt: 42,
	},
}

describe("commitUpload", () => {
	const readFile = async () => Buffer.from("PDFBYTES")

	it("happy path: creates entity, attaches file, marks row created", async () => {
		const intuit: IntuitClient = {
			createEntity: vi
				.fn()
				.mockResolvedValue({ SalesReceipt: { Id: "qb_sr_42" } }),
			uploadAttachable: vi.fn().mockResolvedValue({ Id: "qb_att_7" }),
			queryEntity: vi.fn(),
		}
		const store = fakeStore()

		const res = await commitUpload({
			client: fakeClient(),
			upload: fakeUpload(),
			commit: salesReceiptCommit,
			intuit,
			store,
			readFile,
		})

		expect(res).toEqual({
			status: "created",
			createdEntityId: "qb_sr_42",
			qboAttachableId: "qb_att_7",
			entityHref:
				"https://app.sandbox.qbo.intuit.com/app/salesreceipt?txnId=qb_sr_42",
		})
		expect(intuit.createEntity).toHaveBeenCalledWith(
			"salesreceipt",
			expect.objectContaining({ TotalAmt: 42 }),
		)
		expect(intuit.uploadAttachable).toHaveBeenCalledWith(
			expect.objectContaining({
				fileName: "receipt.pdf",
				mime: "application/pdf",
				attachable: expect.objectContaining({
					AttachableRef: [
						{
							EntityRef: { type: "SalesReceipt", value: "qb_sr_42" },
							IncludeOnSend: false,
						},
					],
				}),
			}),
		)
		expect(store.created).toHaveLength(1)
		expect(store.created[0]?.patch).toMatchObject({
			createdEntityId: "qb_sr_42",
			qboAttachableId: "qb_att_7",
			lastError: null,
		})
		expect(store.failed).toHaveLength(0)
	})

	it("entity create 4xx: marks row failed and rethrows, never calls attach", async () => {
		const fault = { Fault: { Error: [{ Message: "Required field missing" }] } }
		const intuit: IntuitClient = {
			createEntity: vi
				.fn()
				.mockRejectedValue(new IntuitApiError(400, fault, "salesreceipt")),
			uploadAttachable: vi.fn(),
			queryEntity: vi.fn(),
		}
		const store = fakeStore()

		await expect(
			commitUpload({
				client: fakeClient(),
				upload: fakeUpload(),
				commit: salesReceiptCommit,
				intuit,
				store,
				readFile,
			}),
		).rejects.toBeInstanceOf(IntuitApiError)

		expect(intuit.uploadAttachable).not.toHaveBeenCalled()
		expect(store.failed).toHaveLength(1)
		const failedPayload = JSON.parse(store.failed[0]?.lastError ?? "{}")
		expect(failedPayload).toMatchObject({
			stage: "entity_create",
			httpStatus: 400,
			endpoint: "salesreceipt",
			intuitFault: fault,
		})
		expect(store.created).toHaveLength(0)
	})

	it("partial failure: entity created but attach fails → status='created' with warning, qboAttachableId null", async () => {
		const fault = { Fault: { Error: [{ Message: "File too large" }] } }
		const intuit: IntuitClient = {
			createEntity: vi
				.fn()
				.mockResolvedValue({ SalesReceipt: { Id: "qb_sr_99" } }),
			uploadAttachable: vi
				.fn()
				.mockRejectedValue(new IntuitApiError(413, fault, "upload")),
			queryEntity: vi.fn(),
		}
		const store = fakeStore()

		const res = await commitUpload({
			client: fakeClient(),
			upload: fakeUpload(),
			commit: salesReceiptCommit,
			intuit,
			store,
			readFile,
		})

		expect(res).toMatchObject({
			status: "created_no_attachment",
			createdEntityId: "qb_sr_99",
			entityHref:
				"https://app.sandbox.qbo.intuit.com/app/salesreceipt?txnId=qb_sr_99",
			warning: { stage: "attachable", httpStatus: 413 },
		})
		expect(store.failed).toHaveLength(0)
		expect(store.created).toHaveLength(1)
		expect(store.created[0]?.patch).toMatchObject({
			createdEntityId: "qb_sr_99",
			qboAttachableId: null,
		})
		const lastError = JSON.parse(
			(store.created[0]?.patch.lastError as string) ?? "{}",
		)
		expect(lastError).toMatchObject({ stage: "attachable", httpStatus: 413 })
	})

	it("rejects when upload is not in 'classified' status", async () => {
		const intuit: IntuitClient = {
			createEntity: vi.fn(),
			uploadAttachable: vi.fn(),
			queryEntity: vi.fn(),
		}
		await expect(
			commitUpload({
				client: fakeClient(),
				upload: fakeUpload({ status: "pending" }),
				commit: salesReceiptCommit,
				intuit,
				store: fakeStore(),
				readFile,
			}),
		).rejects.toBeInstanceOf(CommitPreconditionError)
		expect(intuit.createEntity).not.toHaveBeenCalled()
	})

	it("rejects when payload entityKind disagrees with row's chosenEntityKind", async () => {
		const intuit: IntuitClient = {
			createEntity: vi.fn(),
			uploadAttachable: vi.fn(),
			queryEntity: vi.fn(),
		}
		await expect(
			commitUpload({
				client: fakeClient(),
				upload: fakeUpload({ chosenEntityKind: EntityKind.invoice }),
				commit: salesReceiptCommit,
				intuit,
				store: fakeStore(),
				readFile,
			}),
		).rejects.toBeInstanceOf(CommitPreconditionError)
		expect(intuit.createEntity).not.toHaveBeenCalled()
	})
})
