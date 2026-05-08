import "server-only"

import { createId } from "@paralleldrive/cuid2"
import { db } from "@/server/db/client"
import { monthEndCloses } from "@/server/db/schema"
import { loadProfitLossData } from "@/server/reports/profit-loss-data"
import { ensureClientInOrg } from "@/server/trpc/ensure-client-in-org"
import { getBaselineProvider } from "./baseline"
import { runDetectors } from "./detectors"
import { narrateClose } from "./narrative"
import { closeThresholds } from "./thresholds"
import type { CloseInputSnapshot, Finding, NarrativePayload } from "./types"
import { computeVariance, type VarianceReport } from "./variance"

export type RunCloseInput = {
	orgId: string
	clientId: string
	userId: string
	startDate: string
	endDate: string
	accountingMethod?: "Accrual" | "Cash"
	baselineKey?: string
}

export type RunCloseResult = {
	id: string
	findings: Finding[]
	narrative: NarrativePayload
	inputSnapshot: CloseInputSnapshot
	variance: VarianceReport
}

export async function runMonthEndClose(
	input: RunCloseInput,
): Promise<RunCloseResult> {
	const client = await ensureClientInOrg(input.orgId, input.clientId)
	const accountingMethod = input.accountingMethod ?? "Accrual"
	const baselineKey = input.baselineKey ?? "prior-month"
	const provider = getBaselineProvider(baselineKey)

	const currentData = await loadProfitLossData({
		orgId: input.orgId,
		clientId: input.clientId,
		startDate: input.startDate,
		endDate: input.endDate,
		accountingMethod,
	})

	const baselines = await provider.loadBaselines({
		orgId: input.orgId,
		clientId: input.clientId,
		accountingMethod,
		current: { start: input.startDate, end: input.endDate },
	})

	if (baselines.length === 0) {
		throw new Error("Baseline provider returned no baselines")
	}

	const primary = baselines[0]
	const variance = computeVariance(currentData.lines, primary)
	const findings = runDetectors(variance, closeThresholds)

	const narrative = await narrateClose({
		period: {
			start: currentData.period.start,
			end: currentData.period.end,
		},
		accountingMethod,
		baselineLabel: provider.label,
		totals: variance.totals,
		findings,
		clientName: client.name,
	})

	const snapshot: CloseInputSnapshot = {
		current: {
			period: currentData.period,
			lines: currentData.lines,
			columns: currentData.columns,
			currency: currentData.currency,
		},
		baselines,
	}

	const id = createId()
	await db.insert(monthEndCloses).values({
		id,
		orgId: input.orgId,
		clientId: input.clientId,
		periodStart: input.startDate,
		periodEnd: input.endDate,
		accountingMethod,
		baselineKey,
		status: "open",
		inputSnapshot: snapshot,
		findings,
		narrative,
		createdByUserId: input.userId,
	})

	return {
		id,
		findings,
		narrative,
		inputSnapshot: snapshot,
		variance,
	}
}
