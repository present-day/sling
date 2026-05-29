import { describe, expect, it, vi } from "vitest"

// Stub the DB client: applyResolutions ultimately calls createCustomer /
// createVendor, which depend on the Intuit client we're already mocking, but
// the create.ts modules also pull @/server/db/schema -> @/server/db/client at
// import time. The fake matches the shape pool.integration.test.ts uses.
vi.mock("@/server/db/client", () => ({
	db: {
		update: vi.fn().mockReturnValue({
			set: vi.fn().mockReturnValue({
				where: vi.fn().mockResolvedValue(undefined),
			}),
		}),
	},
}))

import type { clients } from "@/server/db/schema"
import type { IntuitClient } from "@/server/qbo/intuit-client"
import type { CommitPayload } from "@/server/uploads/commit"
import { EntityKind } from "@/server/uploads/entity-kinds"
import {
	applyResolutions,
	RefRole,
	resolveRefs,
} from "@/server/uploads/resolve-refs"

type ClientRow = typeof clients.$inferSelect

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

function customerQuery(rows: Array<{ Id: string; DisplayName: string }>) {
	return { QueryResponse: { Customer: rows } }
}

function vendorQuery(rows: Array<{ Id: string; DisplayName: string }>) {
	return { QueryResponse: { Vendor: rows } }
}

function invoiceCommit(
	customer: { name?: string; value?: string } | undefined,
): CommitPayload {
	return {
		entityKind: EntityKind.invoice,
		payload: {
			Line: [
				{
					DetailType: "SalesItemLineDetail",
					Amount: 100,
				},
			],
			CustomerRef: customer ?? {},
		},
	}
}

describe("resolveRefs", () => {
	it("returns resolved unchanged when there are no unresolved refs", async () => {
		const intuit: IntuitClient = {
			createEntity: vi.fn(),
			uploadAttachable: vi.fn(),
			queryEntity: vi.fn(),
		}
		const commit = invoiceCommit({ value: "qb_cust_5" })
		const res = await resolveRefs({ commit, intuit })
		expect(res.status).toBe("resolved")
		if (res.status === "resolved") {
			expect(res.commit).toBe(commit)
		}
		expect(intuit.queryEntity).not.toHaveBeenCalled()
	})

	it("auto-resolves exactly-one match by patching CustomerRef.value", async () => {
		const intuit: IntuitClient = {
			createEntity: vi.fn(),
			uploadAttachable: vi.fn(),
			queryEntity: vi
				.fn()
				.mockResolvedValue(
					customerQuery([{ Id: "qb_cust_42", DisplayName: "Unqork" }]),
				),
		}
		const commit = invoiceCommit({ name: "Unqork" })
		const res = await resolveRefs({ commit, intuit })
		expect(res.status).toBe("resolved")
		if (res.status === "resolved") {
			const ref = (res.commit.payload as { CustomerRef?: { value?: string } })
				.CustomerRef
			expect(ref).toEqual({ name: "Unqork", value: "qb_cust_42" })
		}
	})

	it("emits a prompt when there are zero matches", async () => {
		const intuit: IntuitClient = {
			createEntity: vi.fn(),
			uploadAttachable: vi.fn(),
			queryEntity: vi.fn().mockResolvedValue(customerQuery([])),
		}
		const res = await resolveRefs({
			commit: invoiceCommit({ name: "Unqork" }),
			intuit,
		})
		expect(res.status).toBe("needs_prompt")
		if (res.status === "needs_prompt") {
			expect(res.prompts).toHaveLength(1)
			expect(res.prompts[0]).toEqual({
				role: RefRole.customer,
				name: "Unqork",
				matches: [],
			})
		}
	})

	it("emits a prompt with candidates when there are multiple matches", async () => {
		const intuit: IntuitClient = {
			createEntity: vi.fn(),
			uploadAttachable: vi.fn(),
			queryEntity: vi.fn().mockResolvedValue(
				customerQuery([
					{ Id: "qb_cust_1", DisplayName: "Unqork" },
					{ Id: "qb_cust_2", DisplayName: "Unqork Inc" },
				]),
			),
		}
		const res = await resolveRefs({
			commit: invoiceCommit({ name: "Unqork" }),
			intuit,
		})
		expect(res.status).toBe("needs_prompt")
		if (res.status === "needs_prompt") {
			expect(res.prompts[0]?.matches).toEqual([
				{ id: "qb_cust_1", displayName: "Unqork" },
				{ id: "qb_cust_2", displayName: "Unqork Inc" },
			])
		}
	})

	it("escapes single quotes in the query literal", async () => {
		const queryEntity = vi.fn().mockResolvedValue(customerQuery([]))
		const intuit: IntuitClient = {
			createEntity: vi.fn(),
			uploadAttachable: vi.fn(),
			queryEntity,
		}
		await resolveRefs({
			commit: invoiceCommit({ name: "Joe's Diner" }),
			intuit,
		})
		const call = queryEntity.mock.calls[0]?.[0] as string
		expect(call).toContain("Joe\\'s Diner")
	})
})

describe("applyResolutions", () => {
	it("uses existing-match value to patch the ref", async () => {
		const intuit: IntuitClient = {
			createEntity: vi.fn(),
			uploadAttachable: vi.fn(),
			queryEntity: vi.fn(),
		}
		const patched = await applyResolutions({
			commit: invoiceCommit({ name: "Unqork" }),
			resolutions: [
				{
					role: RefRole.customer,
					choice: { kind: "existing", value: "qb_cust_99" },
				},
			],
			client: fakeClient(),
			intuit,
		})
		const ref = (patched.payload as { CustomerRef?: { value?: string } })
			.CustomerRef
		expect(ref).toMatchObject({ value: "qb_cust_99" })
		expect(intuit.createEntity).not.toHaveBeenCalled()
	})

	it("creates a stub Customer when choice is create_new and patches the ref with the new id", async () => {
		const createEntity = vi
			.fn()
			.mockResolvedValue({ Customer: { Id: "qb_cust_new" } })
		const intuit: IntuitClient = {
			createEntity,
			uploadAttachable: vi.fn(),
			queryEntity: vi.fn(),
		}
		const patched = await applyResolutions({
			commit: invoiceCommit({ name: "Unqork" }),
			resolutions: [
				{
					role: RefRole.customer,
					choice: { kind: "create_new", name: "Unqork" },
				},
			],
			client: fakeClient(),
			intuit,
		})
		expect(createEntity).toHaveBeenCalledWith(
			"customer",
			expect.objectContaining({ DisplayName: "Unqork" }),
		)
		const ref = (patched.payload as { CustomerRef?: { value?: string } })
			.CustomerRef
		expect(ref).toMatchObject({ value: "qb_cust_new" })
	})

	it("creates a stub Vendor for a VendorRef create_new resolution", async () => {
		const createEntity = vi
			.fn()
			.mockResolvedValue({ Vendor: { Id: "qb_vend_new" } })
		const intuit: IntuitClient = {
			createEntity,
			uploadAttachable: vi.fn(),
			queryEntity: vi.fn(),
		}
		const billCommit: CommitPayload = {
			entityKind: EntityKind.bill,
			payload: {
				Line: [
					{
						DetailType: "AccountBasedExpenseLineDetail",
						Amount: 50,
					},
				],
				VendorRef: { name: "Acme Co" },
			},
		}
		const patched = await applyResolutions({
			commit: billCommit,
			resolutions: [
				{
					role: RefRole.vendor,
					choice: { kind: "create_new", name: "Acme Co" },
				},
			],
			client: fakeClient(),
			intuit,
		})
		expect(createEntity).toHaveBeenCalledWith(
			"vendor",
			expect.objectContaining({ DisplayName: "Acme Co" }),
		)
		const ref = (patched.payload as { VendorRef?: { value?: string } })
			.VendorRef
		expect(ref).toMatchObject({ value: "qb_vend_new" })
	})

	it("reuses an existing record instead of creating a duplicate on create_new", async () => {
		const createEntity = vi.fn()
		const intuit: IntuitClient = {
			createEntity,
			uploadAttachable: vi.fn(),
			// Exact-name lookup finds the vendor already in QBO.
			queryEntity: vi
				.fn()
				.mockResolvedValue(
					vendorQuery([{ Id: "qb_vend_58", DisplayName: "Anthropic, PBC" }]),
				),
		}
		const billCommit: CommitPayload = {
			entityKind: EntityKind.bill,
			payload: {
				Line: [{ DetailType: "AccountBasedExpenseLineDetail", Amount: 50 }],
				VendorRef: { name: "Anthropic, PBC" },
			},
		}
		const patched = await applyResolutions({
			commit: billCommit,
			resolutions: [
				{
					role: RefRole.vendor,
					choice: { kind: "create_new", name: "Anthropic, PBC" },
				},
			],
			client: fakeClient(),
			intuit,
		})
		expect(createEntity).not.toHaveBeenCalled()
		const ref = (patched.payload as { VendorRef?: { value?: string } })
			.VendorRef
		expect(ref).toMatchObject({ value: "qb_vend_58" })
	})

	it("propagates a create-stub failure", async () => {
		const intuit: IntuitClient = {
			createEntity: vi.fn().mockRejectedValue(new Error("boom")),
			uploadAttachable: vi.fn(),
			queryEntity: vi.fn(),
		}
		await expect(
			applyResolutions({
				commit: invoiceCommit({ name: "Unqork" }),
				resolutions: [
					{
						role: RefRole.customer,
						choice: { kind: "create_new", name: "Unqork" },
					},
				],
				client: fakeClient(),
				intuit,
			}),
		).rejects.toThrow("boom")
	})
})
