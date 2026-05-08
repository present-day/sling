import "server-only"

import { loadProfitLossData } from "@/server/reports/profit-loss-data"
import type { Baseline } from "./types"

export type BaselineLoadContext = {
	orgId: string
	clientId: string
	accountingMethod: "Accrual" | "Cash"
	current: { start: string; end: string }
}

export type BaselineProvider = {
	/** Stable key persisted on the close row (e.g. `"prior-month"`). */
	key: string
	/** Human label for the UI ("Prior month"). */
	label: string
	loadBaselines(ctx: BaselineLoadContext): Promise<Baseline[]>
}

/** Shift a YYYY-MM-DD by N months, returning the first/last day of that month. */
function shiftMonth(
	date: string,
	monthsBack: number,
): { start: string; end: string } {
	const d = new Date(`${date}T00:00:00Z`)
	const y = d.getUTCFullYear()
	const m = d.getUTCMonth()
	const startDate = new Date(Date.UTC(y, m - monthsBack, 1))
	const endDate = new Date(Date.UTC(y, m - monthsBack + 1, 0))
	return {
		start: startDate.toISOString().slice(0, 10),
		end: endDate.toISOString().slice(0, 10),
	}
}

export const priorMonthBaseline: BaselineProvider = {
	key: "prior-month",
	label: "Prior month",
	async loadBaselines(ctx) {
		const prior = shiftMonth(ctx.current.start, 1)
		const data = await loadProfitLossData({
			orgId: ctx.orgId,
			clientId: ctx.clientId,
			startDate: prior.start,
			endDate: prior.end,
			accountingMethod: ctx.accountingMethod,
		})
		return [
			{
				id: "prior-month",
				label: "Prior month",
				period: { start: data.period.start, end: data.period.end },
				lines: data.lines,
				columns: data.columns,
			},
		]
	},
}

/** Lookup table for future pluggability. Add `prior-year` and `trailing-avg` here. */
export const baselineProviders: Record<string, BaselineProvider> = {
	"prior-month": priorMonthBaseline,
}

export function getBaselineProvider(key: string): BaselineProvider {
	const p = baselineProviders[key]
	if (!p) {
		throw new Error(`Unknown baseline provider: ${key}`)
	}
	return p
}
