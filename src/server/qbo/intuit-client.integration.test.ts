/**
 * Direct Intuit v3 client smoke test — integration
 *
 * Posts a real SalesReceipt to a sandbox realm and uploads an Attachable
 * linked to it. Skipped automatically unless the QB credentials AND the
 * explicit write-integration flag are set in the environment:
 *
 *   QUICKBOOKS_CLIENT_ID=... \
 *   QUICKBOOKS_CLIENT_SECRET=... \
 *   QUICKBOOKS_REFRESH_TOKEN=... \
 *   QUICKBOOKS_REALM_ID=... \
 *   SLING_QBO_WRITE_INTEGRATION=1 \
 *   bun run test src/server/qbo/intuit-client.integration.test.ts
 *
 * This is the direct-call replacement for the soon-to-be-removed
 * `quickbooks-mcp` integration test path (see #19).
 */
/** biome-ignore-all lint/style/noNonNullAssertion: testing only */

import { describe, expect, it, vi } from "vitest"

vi.mock("@/server/db/client", () => ({
	db: {
		update: vi.fn().mockReturnValue({
			set: vi.fn().mockReturnValue({
				where: vi.fn().mockResolvedValue(undefined),
			}),
		}),
	},
}))

vi.mock("@/lib/env", () => ({
	getEnv: () => ({
		QUICKBOOKS_CLIENT_ID: process.env.QUICKBOOKS_CLIENT_ID ?? "",
		QUICKBOOKS_CLIENT_SECRET: process.env.QUICKBOOKS_CLIENT_SECRET ?? "",
		QUICKBOOKS_REDIRECT_URI:
			process.env.QUICKBOOKS_REDIRECT_URI ??
			"http://localhost:3000/api/qbo/oauth/callback",
	}),
}))

vi.mock("@/server/qbo/tokens", () => ({
	decryptRefreshToken: (v: string) => v,
	encryptRefreshToken: (v: string) => v,
}))

import { makeIntuitClient } from "./intuit-client"

const hasCredentials =
	!!process.env.QUICKBOOKS_CLIENT_ID &&
	!!process.env.QUICKBOOKS_CLIENT_SECRET &&
	!!process.env.QUICKBOOKS_REFRESH_TOKEN &&
	!!process.env.QUICKBOOKS_REALM_ID &&
	process.env.SLING_QBO_WRITE_INTEGRATION === "1"

describe.skipIf(!hasCredentials)(
	"Intuit direct client smoke test (requires QB write-integration flag)",
	() => {
		const clientRow = {
			id: "smoke-test-client",
			orgId: "smoke-test-org",
			name: "Smoke Test Client",
			realmId: process.env.QUICKBOOKS_REALM_ID!,
			environment: (process.env.QUICKBOOKS_ENVIRONMENT ?? "sandbox") as
				| "sandbox"
				| "production",
			encryptedRefreshToken: process.env.QUICKBOOKS_REFRESH_TOKEN!,
			tokenUpdatedAt: new Date(),
			createdAt: new Date(),
		}

		it("creates a SalesReceipt and uploads an Attachable in the sandbox realm", async () => {
			const intuit = makeIntuitClient(clientRow)

			const sr = await intuit.createEntity<{ SalesReceipt: { Id: string } }>(
				"salesreceipt",
				{
					Line: [
						{
							DetailType: "SalesItemLineDetail",
							Amount: 1.23,
							Description: "sling integration smoke",
						},
					],
					PrivateNote: "sling integration smoke test",
				},
			)
			expect(sr.SalesReceipt.Id).toBeTruthy()

			const att = await intuit.uploadAttachable({
				fileName: "smoke.txt",
				mime: "text/plain",
				bytes: Buffer.from("sling-smoke-test"),
				attachable: {
					FileName: "smoke.txt",
					ContentType: "text/plain",
					AttachableRef: [
						{
							EntityRef: {
								type: "SalesReceipt",
								value: sr.SalesReceipt.Id,
							},
							IncludeOnSend: false,
						},
					],
				},
			})
			expect(att.Id).toBeTruthy()
		}, 30_000)
	},
)
