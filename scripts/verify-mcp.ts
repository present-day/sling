/**
 * Smoke-test MCP server path (spawns child; requires valid QuickBooks env vars).
 * Usage:
 *   MCP_QBO_SERVER_PATH=... QUICKBOOKS_CLIENT_ID=... QUICKBOOKS_CLIENT_SECRET=... \
 *   QUICKBOOKS_REFRESH_TOKEN=... QUICKBOOKS_REALM_ID=... bunx tsx scripts/verify-mcp.ts
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

async function main() {
	const mcpPath = process.env.MCP_QBO_SERVER_PATH;
	if (!mcpPath) {
		throw new Error("MCP_QBO_SERVER_PATH is required");
	}
	const transport = new StdioClientTransport({
		command: process.execPath,
		args: [mcpPath],
		env: {
			...process.env,
			QUICKBOOKS_ENVIRONMENT: process.env.QUICKBOOKS_ENVIRONMENT ?? "sandbox",
		},
		stderr: "inherit",
	});
	const client = new Client({ name: "verify-mcp", version: "0.0.1" }, {});
	await client.connect(transport);
	const tools = await client.listTools();
	console.log("Tools:", tools.tools.length);
	await transport.close();
}

void main();
