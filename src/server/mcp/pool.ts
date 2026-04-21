import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { eq } from "drizzle-orm";
import { getEnv } from "@/lib/env";
import { db } from "@/server/db/client";
import { clients } from "@/server/db/schema";
import { decryptRefreshToken } from "@/server/qbo/tokens";

export type McpHandle = {
	client: Client;
	transport: StdioClientTransport;
	tools: Awaited<ReturnType<Client["listTools"]>>;
	lastUsed: number;
};

const pool = new Map<string, McpHandle>();
const IDLE_MS = 10 * 60 * 1000;

function serverCommand(): { command: string; args: string[] } {
	const env = getEnv();
	const p = env.MCP_QBO_SERVER_PATH;
	if (p.endsWith(".js")) {
		return { command: process.execPath, args: [p] };
	}
	return { command: p, args: [] };
}

export async function getMcpForClient(clientId: string): Promise<McpHandle> {
	const existing = pool.get(clientId);
	if (existing) {
		existing.lastUsed = Date.now();
		return existing;
	}
	const row = await db.query.clients.findFirst({
		where: eq(clients.id, clientId),
	});
	if (!row) {
		throw new Error("Client not found");
	}
	const env = getEnv();
	const refresh = decryptRefreshToken(row.encryptedRefreshToken);
	const { command, args } = serverCommand();
	const transport = new StdioClientTransport({
		command,
		args,
		env: {
			...process.env,
			QUICKBOOKS_CLIENT_ID: env.QUICKBOOKS_CLIENT_ID,
			QUICKBOOKS_CLIENT_SECRET: env.QUICKBOOKS_CLIENT_SECRET,
			QUICKBOOKS_REFRESH_TOKEN: refresh,
			QUICKBOOKS_REALM_ID: row.realmId,
			QUICKBOOKS_ENVIRONMENT: row.environment,
		},
		stderr: "pipe",
	});
	const client = new Client({ name: "zerocool-console", version: "0.1.0" }, {});
	await client.connect(transport);
	const tools = await client.listTools();
	const handle: McpHandle = {
		client,
		transport,
		tools,
		lastUsed: Date.now(),
	};
	pool.set(clientId, handle);
	return handle;
}

export async function callMcpTool(
	clientId: string,
	toolName: string,
	args: Record<string, unknown>,
): Promise<unknown> {
	const { client } = await getMcpForClient(clientId);
	const res = await client.callTool({ name: toolName, arguments: args });
	if (res.isError === true) {
		throw new Error(JSON.stringify(res.content ?? []));
	}
	const parts = Array.isArray(res.content) ? res.content : [];
	const text = parts
		.filter((c): c is { type: "text"; text: string } => c.type === "text")
		.map((c) => c.text)
		.join("\n");
	if (!text) {
		return res.content;
	}
	try {
		return JSON.parse(text) as unknown;
	} catch {
		return text;
	}
}

export function listCachedToolManifests(): {
	clientId: string;
	count: number;
}[] {
	return [...pool.entries()].map(([clientId, h]) => ({
		clientId,
		count: h.tools.tools.length,
	}));
}

setInterval(() => {
	const now = Date.now();
	for (const [id, h] of pool) {
		if (now - h.lastUsed > IDLE_MS) {
			void h.transport.close().finally(() => pool.delete(id));
		}
	}
}, 60_000).unref?.();
