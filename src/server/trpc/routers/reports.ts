import { z } from "zod";
import { orgProcedure, router } from "../init";

export const reportsRouter = router({
	list: orgProcedure.query(async ({ ctx }) => {
		const rows = await ctx.db.query.reportTemplates.findMany({
			where: (r, { eq: eqFn }) => eqFn(r.orgId, ctx.orgId),
		});
		return z
			.array(
				z.object({
					id: z.string(),
					slug: z.string(),
					name: z.string(),
					kind: z.enum(["profit_loss", "balance_sheet", "cash_flow", "custom"]),
				}),
			)
			.parse(rows);
	}),
	getBySlug: orgProcedure
		.input(z.object({ slug: z.string() }))
		.query(async ({ ctx, input }) => {
			const row = await ctx.db.query.reportTemplates.findFirst({
				where: (r, { eq: eqFn, and: andFn }) =>
					andFn(eqFn(r.orgId, ctx.orgId), eqFn(r.slug, input.slug)),
			});
			if (!row) {
				return null;
			}
			return z
				.object({
					id: z.string(),
					slug: z.string(),
					name: z.string(),
					kind: z.enum(["profit_loss", "balance_sheet", "cash_flow", "custom"]),
					config: z.unknown(),
				})
				.parse(row);
		}),
});
