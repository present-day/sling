import { TRPCError } from "@trpc/server"
import { z } from "zod"
import { searchQboEntityList } from "@/server/qbo/entity-list-search"
import { ensureClientInOrg } from "@/server/trpc/ensure-client-in-org"
import { orgProcedure, router } from "../init"

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
			const client = await ensureClientInOrg(ctx.orgId, input.clientId)
			try {
				const rows = await searchQboEntityList(
					client,
					input.entity,
					input.query,
					input.limit,
				)
				return z.object({ rows: z.unknown() }).parse({ rows })
			} catch (e) {
				const message =
					e instanceof Error ? e.message : "QuickBooks search failed"
				throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message })
			}
		}),
})
