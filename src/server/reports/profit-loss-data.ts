import "server-only"

import { db } from "@/server/db/client"
import { fetchProfitAndLossReport } from "@/server/qbo/profit-and-loss"
import {
	defaultProfitLossTemplateConfig,
	parseProfitLossConfig,
} from "@/server/reports/profit-loss-config"
import { ensureClientInOrg } from "@/server/trpc/ensure-client-in-org"

export async function loadProfitLossData(options: {
	orgId: string
	clientId: string
	startDate: string
	endDate: string
	accountingMethod?: "Accrual" | "Cash"
	summarizeColumnBy?: "Total" | "Month" | "Week" | "Days" | "Quarter" | "Year"
}) {
	const client = await ensureClientInOrg(options.orgId, options.clientId)
	const templateRow = await db.query.reportTemplates.findFirst({
		where: (r, { eq: eqFn, and: andFn }) =>
			andFn(eqFn(r.orgId, options.orgId), eqFn(r.slug, "profit-loss")),
	})
	const templateConfig = templateRow
		? parseProfitLossConfig(templateRow.config)
		: defaultProfitLossTemplateConfig
	const accountingMethod =
		options.accountingMethod ??
		(templateConfig.params.accountingMethod === "cash" ? "Cash" : "Accrual")
	const summarizeBy =
		options.summarizeColumnBy ?? templateConfig.params.summarizeColumnBy
	const qboSummarize =
		summarizeBy && summarizeBy !== "Total" ? summarizeBy : undefined
	const report = await fetchProfitAndLossReport({
		client,
		startDate: options.startDate,
		endDate: options.endDate,
		accountingMethod: accountingMethod as "Cash" | "Accrual",
		...(qboSummarize ? { summarizeColumnBy: qboSummarize } : {}),
	})
	const header = report.Header as
		| {
				ReportName?: string
				Time?: string
				StartPeriod?: string
				EndPeriod?: string
		  }
		| undefined
	return {
		template: templateConfig,
		reportName: header?.ReportName ?? "Profit and Loss",
		period: {
			start: header?.StartPeriod ?? options.startDate,
			end: header?.EndPeriod ?? options.endDate,
		},
		columns: report.columns,
		lines: report.normalizedLines,
		currency: (report.Header as { Currency?: string } | undefined)?.Currency,
	}
}
