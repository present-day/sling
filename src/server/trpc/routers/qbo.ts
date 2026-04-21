import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { callMcpTool, getMcpForClient } from "@/server/mcp/pool";
import { orgProcedure, router } from "../init";

const clientIdInput = z.object({ clientId: z.string() });

async function assertClientInOrg(
	ctx: {
		db: typeof import("@/server/db/client")["db"];
		orgId: string;
	},
	clientId: string,
) {
	const row = await ctx.db.query.clients.findFirst({
		where: (c, { eq: eqFn, and: andFn }) =>
			andFn(eqFn(c.id, clientId), eqFn(c.orgId, ctx.orgId)),
	});
	if (!row) {
		throw new TRPCError({ code: "NOT_FOUND", message: "Client not found" });
	}
	return row;
}

const toolRef = z.object({
	name: z.string(),
	description: z.string().optional(),
});

export const qboRouter = router({
	listTools: orgProcedure.input(clientIdInput).query(async ({ ctx, input }) => {
		await assertClientInOrg(ctx, input.clientId);
		try {
			const mcp = await getMcpForClient(input.clientId);
			return z
				.object({
					tools: z.array(toolRef),
				})
				.parse({
					tools: mcp.tools.tools.map((t) => ({
						name: t.name,
						description: t.description,
					})),
				});
		} catch (e) {
			const message = e instanceof Error ? e.message : "MCP unavailable";
			throw new TRPCError({
				code: "PRECONDITION_FAILED",
				message,
			});
		}
	}),
	callTool: orgProcedure
		.input(
			z.object({
				clientId: z.string(),
				toolName: z.string(),
				args: z.record(z.string(), z.unknown()),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			await assertClientInOrg(ctx, input.clientId);
			try {
				const result = await callMcpTool(
					input.clientId,
					input.toolName,
					input.args,
				);
				return z.object({ result: z.unknown() }).parse({ result });
			} catch (e) {
				const message = e instanceof Error ? e.message : "Tool call failed";
				throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message });
			}
		}),
	searchProxy: orgProcedure
		.input(
			z.object({
				clientId: z.string(),
				entity: z.string(),
				query: z.string().optional(),
				limit: z.number().min(1).max(100).default(25),
			}),
		)
		.query(async ({ ctx, input }) => {
			await assertClientInOrg(ctx, input.clientId);
			const toolName = `search_${input.entity}`;
			const result = await callMcpTool(input.clientId, toolName, {
				query: input.query ?? "",
				limit: input.limit,
			});
			return z.object({ rows: z.unknown() }).parse({ rows: result });
		}),
});
