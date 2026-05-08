import { NextResponse } from "next/server"
import { auth } from "@/server/auth"
import { loadProfitLossData } from "@/server/reports/profit-loss-data"
import { buildProfitLossHtml } from "@/server/reports/profit-loss-html"

export async function GET(
	req: Request,
	ctx: { params: Promise<{ clientId: string; template: string }> },
) {
	const session = await auth.api.getSession({ headers: req.headers })
	if (!session?.user) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
	}
	const orgId = session.session?.activeOrganizationId
	if (!orgId) {
		return NextResponse.json(
			{ error: "Select an organization first" },
			{ status: 400 },
		)
	}

	const { clientId, template } = await ctx.params
	if (template !== "profit-loss") {
		return new NextResponse(
			`<!DOCTYPE html><html><body><p>Template <code>${template}</code> is not implemented.</p></body></html>`,
			{ headers: { "Content-Type": "text/html; charset=utf-8" } },
		)
	}

	const u = new URL(req.url)
	const startDate = u.searchParams.get("start_date")
	const endDate = u.searchParams.get("end_date")
	const accountingMethod = u.searchParams.get("accounting_method")
	const summarize = u.searchParams.get("summarize_column_by")

	if (!startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
		return NextResponse.json(
			{ error: "Query start_date (YYYY-MM-DD) is required" },
			{ status: 400 },
		)
	}
	if (!endDate || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
		return NextResponse.json(
			{ error: "Query end_date (YYYY-MM-DD) is required" },
			{ status: 400 },
		)
	}

	try {
		const data = await loadProfitLossData({
			orgId,
			clientId,
			startDate,
			endDate,
			...(accountingMethod === "Cash" || accountingMethod === "Accrual"
				? { accountingMethod }
				: {}),
			...(summarize &&
			["Total", "Month", "Week", "Days", "Quarter", "Year"].includes(summarize)
				? {
						summarizeColumnBy: summarize as
							| "Total"
							| "Month"
							| "Week"
							| "Days"
							| "Quarter"
							| "Year",
					}
				: {}),
		})
		const html = buildProfitLossHtml({
			reportName: data.reportName,
			period: data.period,
			currency: data.currency,
			columns: data.columns,
			lines: data.lines,
		})
		return new NextResponse(html, {
			headers: { "Content-Type": "text/html; charset=utf-8" },
		})
	} catch (e) {
		const message = e instanceof Error ? e.message : "Report failed"
		return NextResponse.json({ error: message }, { status: 500 })
	}
}
