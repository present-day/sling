import { TRPCError } from "@trpc/server"
import { z } from "zod"
import { parseProfitLossConfig } from "@/server/reports/profit-loss-config"
import { loadProfitLossData } from "@/server/reports/profit-loss-data"
import { orgProcedure, router } from "../init"

export const reportsRouter = router({
	list: orgProcedure.query(async ({ ctx }) => {
		const rows = await ctx.db.query.reportTemplates.findMany({
			where: (r, { eq: eqFn }) => eqFn(r.orgId, ctx.orgId),
		})
		return z
			.array(
				z.object({
					id: z.string(),
					slug: z.string(),
					name: z.string(),
					kind: z.enum(["profit_loss", "balance_sheet", "cash_flow", "custom"]),
					hasSourcePdf: z.boolean().optional(),
				}),
			)
			.parse(
				rows.map((r) => ({
					...r,
					hasSourcePdf: Boolean(r.sourcePdfStoragePath),
				})),
			)
	}),
	getBySlug: orgProcedure
		.input(z.object({ slug: z.string() }))
		.query(async ({ ctx, input }) => {
			const row = await ctx.db.query.reportTemplates.findFirst({
				where: (r, { eq: eqFn, and: andFn }) =>
					andFn(eqFn(r.orgId, ctx.orgId), eqFn(r.slug, input.slug)),
			})
			if (!row) {
				return null
			}
			const { config: _raw, ...rest } = row
			return z
				.object({
					id: z.string(),
					slug: z.string(),
					name: z.string(),
					kind: z.enum(["profit_loss", "balance_sheet", "cash_flow", "custom"]),
					config: z.unknown(),
					sourcePdfFileName: z.string().nullable().optional(),
					sourcePdfStoragePath: z.string().nullable().optional(),
				})
				.parse({
					...rest,
					config: parseProfitLossConfig(row.config),
				})
		}),
	/**
	 * Live Profit & Loss from QuickBooks, merged with the org’s `profit-loss` template (or defaults).
	 */
	profitLoss: orgProcedure
		.input(
			z.object({
				clientId: z.string(),
				startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
				endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
				accountingMethod: z.enum(["Accrual", "Cash"]).optional(),
				summarizeColumnBy: z
					.enum(["Total", "Month", "Week", "Days", "Quarter", "Year"])
					.optional(),
			}),
		)
		.query(async ({ ctx, input }) => {
			try {
				return await loadProfitLossData({
					orgId: ctx.orgId,
					clientId: input.clientId,
					startDate: input.startDate,
					endDate: input.endDate,
					accountingMethod: input.accountingMethod,
					summarizeColumnBy: input.summarizeColumnBy,
				})
			} catch (e) {
				const message =
					e instanceof Error ? e.message : "QuickBooks P&L request failed"
				throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message })
			}
		}),
})
