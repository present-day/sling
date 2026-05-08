import "server-only";
import type { ChildProcess } from "node:child_process";
import path from "node:path";
import { createInterface } from "node:readline";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { eq } from "drizzle-orm";
import { getEnv } from "@/lib/env";
import { db } from "@/server/db/client";
import { clients } from "@/server/db/schema";
import { decryptRefreshToken, encryptRefreshToken } from "@/server/qbo/tokens";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // evict child after 5 min idle
const CALL_TIMEOUT_MS = 30 * 1000; // max time for a single tool call

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ClientRow = typeof clients.$inferSelect;

interface PoolEntry {
	mcpClient: Client;
	transport: StdioClientTransport;
	idleTimer: ReturnType<typeof setTimeout>;
}

// ---------------------------------------------------------------------------
// Module-level pool — one stdio child process per clientId
// ---------------------------------------------------------------------------

const pool = new Map<string, PoolEntry>();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolve the path to the compiled quickbooks-mcp entry point.
 *
 * Default assumes Next.js cwd is `app/console/apps/console/`, so three levels
 * up lands at `app/`, then into `quickbooks-mcp/dist/index.js`.
 *
 * Override with MCP_QBO_SERVER_PATH for production deployments where the MCP
 * binary lives elsewhere.
 */
function serverPath(): string {
	return (
		process.env.MCP_QBO_SERVER_PATH ??
		path.resolve(process.cwd(), "../quickbooks-mcp/dist/index.js")
	);
}

function resetIdleTimer(clientId: string, entry: PoolEntry): void {
	clearTimeout(entry.idleTimer);
	entry.idleTimer = setTimeout(() => void evict(clientId), IDLE_TIMEOUT_MS);
}

async function evict(clientId: string): Promise<void> {
	const entry = pool.get(clientId);
	if (!entry) return;
	pool.delete(clientId);
	try {
		await entry.mcpClient.close();
	} catch {
		// Best-effort: child may already be gone
	}
}

/**
 * Watch the child process's stderr line-by-line.
 *
 * The quickbooks-mcp server emits a structured JSON event on stderr whenever
 * Intuit rotates a refresh token during a token refresh:
 *
 *   {"zerocool_event":"token_rotated","refreshToken":"...","realmId":"..."}
 *
 * Non-JSON lines (ordinary log output) are silently ignored.
 */
function watchStderr(stderr: NodeJS.ReadableStream, clientId: string): void {
	const rl = createInterface({ input: stderr, crlfDelay: Infinity });

	rl.on("line", (line) => {
		let parsed: unknown;
		try {
			parsed = JSON.parse(line);
		} catch {
			return; // plain log line — ignore
		}

		if (
			typeof parsed !== "object" ||
			parsed === null ||
			(parsed as Record<string, unknown>).zerocool_event !== "token_rotated"
		) {
			return;
		}

		const { refreshToken } = parsed as { refreshToken?: string };
		if (!refreshToken) return;

		void (async () => {
			try {
				await db
					.update(clients)
					.set({
						encryptedRefreshToken: encryptRefreshToken(refreshToken),
						tokenUpdatedAt: new Date(),
					})
					.where(eq(clients.id, clientId));
			} catch (err) {
				console.error(
					`[mcp-pool] failed to persist rotated token for client ${clientId}:`,
					err,
				);
			}
		})();
	});
}

async function spawnEntry(clientRow: ClientRow): Promise<PoolEntry> {
	const env = getEnv();
	const refreshToken = decryptRefreshToken(clientRow.encryptedRefreshToken);

	const spawnEnv: Record<string, string> = {
		// Inherit parent env so Node.js, PATH, etc. are available in the child
		...(process.env as Record<string, string>),
		// Per-client QuickBooks credentials
		QUICKBOOKS_CLIENT_ID: env.QUICKBOOKS_CLIENT_ID,
		QUICKBOOKS_CLIENT_SECRET: env.QUICKBOOKS_CLIENT_SECRET,
		QUICKBOOKS_REFRESH_TOKEN: refreshToken,
		QUICKBOOKS_REALM_ID: clientRow.realmId,
		QUICKBOOKS_ENVIRONMENT: clientRow.environment,
		QUICKBOOKS_REDIRECT_URI: env.QUICKBOOKS_REDIRECT_URI,
		// Signal to the MCP server that tokens are managed externally —
		// suppresses .env file writes and enables stderr token rotation events
		QUICKBOOKS_TOKEN_MANAGED: "true",
	};

	const transport = new StdioClientTransport({
		command: "node",
		args: [serverPath()],
		env: spawnEnv,
		// Pipe stderr so we can parse token rotation events; without this it
		// inherits the parent process's stderr and we cannot intercept it.
		stderr: "pipe",
	});

	const mcpClient = new Client(
		{ name: "zerocool-console", version: "1.0.0" },
		{ capabilities: {} },
	);

	await mcpClient.connect(transport);

	// _process is set during transport.start(), which connect() calls.
	// We cast through unknown because _process is a private field on the SDK
	// class — it is reliably present after connect() resolves.
	const proc = (transport as unknown as { _process?: ChildProcess })._process;

	if (proc?.stderr) {
		watchStderr(proc.stderr, clientRow.id);
	}

	const entry: PoolEntry = {
		mcpClient,
		transport,
		idleTimer: setTimeout(() => void evict(clientRow.id), IDLE_TIMEOUT_MS),
	};

	return entry;
}

async function getOrSpawn(clientRow: ClientRow): Promise<PoolEntry> {
	const existing = pool.get(clientRow.id);
	if (existing) {
		resetIdleTimer(clientRow.id, existing);
		return existing;
	}
	const entry = await spawnEntry(clientRow);
	pool.set(clientRow.id, entry);
	return entry;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Call a QuickBooks MCP tool for a specific client.
 *
 * Spawns a stdio child process on first use and keeps it alive for
 * IDLE_TIMEOUT_MS. Each client gets its own isolated process — credentials
 * never cross tenant boundaries.
 *
 * **Caller is responsible for tenant authorization** (ensureClientInOrg or
 * equivalent) before passing clientRow here. This function trusts the row.
 */
export async function callQboTool(
	clientRow: ClientRow,
	toolName: string,
	args: Record<string, unknown>,
): Promise<unknown> {
	const entry = await getOrSpawn(clientRow);
	resetIdleTimer(clientRow.id, entry);

	// All quickbooks-mcp tools are registered via RegisterTool() which wraps
	// the schema as { params: toolSchema }. Callers pass natural args; we wrap.
	return Promise.race([
		entry.mcpClient.callTool({ name: toolName, arguments: { params: args } }),
		new Promise<never>((_, reject) =>
			setTimeout(
				() =>
					reject(
						new Error(
							`[mcp-pool] tool call timed out after ${CALL_TIMEOUT_MS}ms: ${toolName}`,
						),
					),
				CALL_TIMEOUT_MS,
			),
		),
	]);
}

/**
 * Drain the entire pool (close all child processes).
 * Useful for graceful shutdown and test teardown.
 */
export async function drainPool(): Promise<void> {
	await Promise.allSettled([...pool.keys()].map(evict));
}
