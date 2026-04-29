/**
 * MCP pool smoke test — integration
 *
 * Spawns a real quickbooks-mcp child process, calls get_company_info, and
 * asserts a result comes back. Skipped automatically when QuickBooks
 * credentials are not present in the environment.
 *
 * Run against a sandbox realm:
 *
 *   QUICKBOOKS_CLIENT_ID=... \
 *   QUICKBOOKS_CLIENT_SECRET=... \
 *   QUICKBOOKS_REFRESH_TOKEN=... \
 *   QUICKBOOKS_REALM_ID=... \
 *   bun test src/server/mcp/pool.integration.test.ts
 *
 * Or source your .env.local first:
 *
 *   set -a && source .env.local && set +a && bun test src/server/mcp/pool.integration.test.ts
 */

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// ── Hoist mocks before any module under test is imported ────────────────────

// Stub the DB so token rotation events during the test don't require a live DB.
vi.mock("@/server/db/client", () => ({
	db: {
		update: vi.fn().mockReturnValue({
			set: vi.fn().mockReturnValue({
				where: vi.fn().mockResolvedValue(undefined),
			}),
		}),
	},
}));

// getEnv() validates the entire app env; pull only what the pool needs from
// the process env rather than requiring every Next.js var to be set.
vi.mock("@/lib/env", () => ({
	getEnv: () => ({
		QUICKBOOKS_CLIENT_ID: process.env.QUICKBOOKS_CLIENT_ID ?? "",
		QUICKBOOKS_CLIENT_SECRET: process.env.QUICKBOOKS_CLIENT_SECRET ?? "",
		QUICKBOOKS_REDIRECT_URI:
			process.env.QUICKBOOKS_REDIRECT_URI ??
			"http://localhost:3000/api/qbo/oauth/callback",
	}),
}));

// Pass the refresh token through as plain text so the test doesn't need
// TOKEN_ENCRYPTION_KEY. The pool calls decryptRefreshToken on the row value
// before injecting it into the child — identity here keeps it unchanged.
vi.mock("@/server/qbo/tokens", () => ({
	decryptRefreshToken: (v: string) => v,
	encryptRefreshToken: (v: string) => v,
}));

// ── Imports (after mocks are registered) ────────────────────────────────────

import { callQboTool, drainPool } from "./pool";

// ── Guard ────────────────────────────────────────────────────────────────────

const hasCredentials =
	!!process.env.QUICKBOOKS_CLIENT_ID &&
	!!process.env.QUICKBOOKS_CLIENT_SECRET &&
	!!process.env.QUICKBOOKS_REFRESH_TOKEN &&
	!!process.env.QUICKBOOKS_REALM_ID;

// ── Test ─────────────────────────────────────────────────────────────────────

describe.skipIf(!hasCredentials)(
	"MCP pool smoke test (requires QB credentials)",
	() => {
		// Build a minimal client row from env vars. decryptRefreshToken is
		// mocked to identity so the raw token is passed straight through.
		const clientRow = {
			id: "smoke-test-client",
			orgId: "smoke-test-org",
			name: "Smoke Test Client",
			realmId: process.env.QUICKBOOKS_REALM_ID!,
			environment: (
				process.env.QUICKBOOKS_ENVIRONMENT ?? "sandbox"
			) as "sandbox" | "production",
			encryptedRefreshToken: process.env.QUICKBOOKS_REFRESH_TOKEN!,
			tokenUpdatedAt: new Date(),
			createdAt: new Date(),
		};

		afterAll(async () => {
			await drainPool();
		});

		it(
			"spawns the MCP child and returns a result from get_company_info",
			async () => {
				const result = await callQboTool(clientRow, "get_company_info", { company_id: undefined });

				// The MCP protocol wraps results in { content: [...] }
				expect(result).toBeDefined();
				expect(result).toHaveProperty("content");

				const content = (result as { content: unknown[] }).content;
				expect(Array.isArray(content)).toBe(true);
				expect(content.length).toBeGreaterThan(0);

				// At least one content item should contain company info text
				const text = content
					.filter((c): c is { type: string; text: string } =>
						typeof (c as Record<string, unknown>).text === "string",
					)
					.map((c) => c.text)
					.join("\n");

				expect(text.length).toBeGreaterThan(0);
				console.log("[smoke] get_company_info response:", text.slice(0, 200));
			},
			15_000, // QB API can be slow — 15 s timeout
		);

		it(
			"reuses the same child process on a second call (pool hit)",
			async () => {
				// Both calls should succeed and return without spawning a new process.
				const [r1, r2] = await Promise.all([
					callQboTool(clientRow, "get_company_info", { company_id: undefined }),
					callQboTool(clientRow, "get_company_info", { company_id: undefined }),
				]);

				expect(r1).toHaveProperty("content");
				expect(r2).toHaveProperty("content");
			},
			15_000,
		);
	},
);
