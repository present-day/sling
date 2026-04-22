import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { searchQboEntityList } from "@/server/qbo/entity-list-search";
import { orgProcedure, router } from "../init";

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

export const qboRouter = router({
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
			const client = await assertClientInOrg(ctx, input.clientId);
			try {
				const rows = await searchQboEntityList(
					client,
					input.entity,
					input.query,
					input.limit,
				);
				return z.object({ rows: z.unknown() }).parse({ rows });
			} catch (e) {
				const message =
					e instanceof Error ? e.message : "QuickBooks search failed";
				throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message });
			}
		}),
});
