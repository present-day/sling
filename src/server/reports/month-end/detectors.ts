import { type CloseThresholds, closeThresholds } from "./thresholds"
import type { Finding, FindingSeverity } from "./types"
import type { VarianceReport, VarianceRow } from "./variance"

type DetectorContext = {
	thresholds: CloseThresholds
	variance: VarianceReport
}

type Detector = (ctx: DetectorContext) => Finding[]

function fingerprint(parts: (string | number)[]): string {
	return parts
		.map((p) =>
			String(p)
				.toLowerCase()
				.replace(/[^a-z0-9]+/g, "-")
				.replace(/^-|-$/g, ""),
		)
		.join("_")
		.slice(0, 96)
}

function severityFromDelta(
	absDelta: number,
	t: CloseThresholds,
): FindingSeverity {
	if (Math.abs(absDelta) >= t.criticalAbs) {
		return "critical"
	}
	return "warn"
}

function fmt(n: number | null): string {
	if (n === null) {
		return "—"
	}
	const sign = n < 0 ? "-" : ""
	const abs = Math.abs(n)
	return `${sign}$${abs.toLocaleString(undefined, {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	})}`
}

function fmtPct(n: number | null): string {
	if (n === null) {
		return "—"
	}
	return `${n.toFixed(1)}%`
}

/** Only data lines; skip section/summary/header rows. */
function dataRows(v: VarianceReport): VarianceRow[] {
	return v.rows.filter((r) => r.kind === "data")
}

const materialVarianceDetector: Detector = ({ thresholds, variance }) => {
	const out: Finding[] = []
	for (const row of dataRows(variance)) {
		if (row.absDelta === null || row.pctDelta === null) {
			continue
		}
		if (row.isNewInCurrent || row.isMissingInCurrent) {
			continue
		}
		const abs = Math.abs(row.absDelta)
		const pct = Math.abs(row.pctDelta)
		if (abs >= thresholds.materialAbs && pct >= thresholds.materialPct) {
			out.push({
				id: `material_${fingerprint([row.path, row.absDelta.toFixed(0)])}`,
				detector: "material_variance",
				severity: severityFromDelta(row.absDelta, thresholds),
				title: `${row.label} moved ${fmt(row.absDelta)} (${fmtPct(row.pctDelta)}) vs prior period`,
				evidence: {
					rule: `|Δ| ≥ ${fmt(thresholds.materialAbs)} AND |Δ%| ≥ ${thresholds.materialPct}%`,
					thresholdLabel: "Material variance",
					currentValue: row.current,
					baselineValue: row.baseline,
					absDelta: row.absDelta,
					pctDelta: row.pctDelta,
				},
				affectedLinePaths: [row.path],
				suggestedAction: `Review ${row.label} postings for the period to confirm the movement is expected.`,
			})
		}
	}
	return out
}

const newLineDetector: Detector = ({ thresholds, variance }) => {
	const out: Finding[] = []
	for (const row of dataRows(variance)) {
		if (!row.isNewInCurrent || row.current === null) {
			continue
		}
		if (Math.abs(row.current) < thresholds.newLineMinAbs) {
			continue
		}
		out.push({
			id: `new_${fingerprint([row.path])}`,
			detector: "new_line",
			severity: "warn",
			title: `New account this period: ${row.label} (${fmt(row.current)})`,
			evidence: {
				rule: `No baseline activity + |current| ≥ ${fmt(thresholds.newLineMinAbs)}`,
				thresholdLabel: "New account",
				currentValue: row.current,
				baselineValue: 0,
				absDelta: row.current,
				pctDelta: null,
			},
			affectedLinePaths: [row.path],
			suggestedAction: `Confirm ${row.label} is correctly mapped and not a miscoded duplicate of an existing account.`,
		})
	}
	return out
}

const missingRecurringDetector: Detector = ({ thresholds, variance }) => {
	const out: Finding[] = []
	for (const row of dataRows(variance)) {
		const baseline = row.baseline
		if (
			baseline === null ||
			Math.abs(baseline) < thresholds.missingRecurringMinAbs
		) {
			continue
		}
		const missing =
			row.isMissingInCurrent || (row.current !== null && row.current === 0)
		if (!missing) {
			continue
		}
		out.push({
			id: `missing_${fingerprint([row.path])}`,
			detector: "missing_recurring",
			severity: "warn",
			title: `Recurring line absent this period: ${row.label} (baseline ${fmt(baseline)})`,
			evidence: {
				rule: `baseline ≥ ${fmt(thresholds.missingRecurringMinAbs)} AND current = 0`,
				thresholdLabel: "Missing recurring",
				currentValue: row.current ?? 0,
				baselineValue: baseline,
				absDelta: (row.current ?? 0) - baseline,
				pctDelta: -100,
			},
			affectedLinePaths: [row.path],
			suggestedAction: `Check whether the ${row.label} entry was missed, paid under a different GL account, or genuinely paused.`,
		})
	}
	return out
}

const signFlipDetector: Detector = ({ variance }) => {
	const out: Finding[] = []
	for (const row of dataRows(variance)) {
		if (row.current === null) {
			continue
		}
		const isExpense =
			row.bucket === "expense" ||
			row.bucket === "cogs" ||
			row.bucket === "other_expense"
		const isIncome = row.bucket === "income" || row.bucket === "other_income"
		const flipped =
			(isExpense && row.current < 0) || (isIncome && row.current < 0)
		if (!flipped) {
			continue
		}
		out.push({
			id: `signflip_${fingerprint([row.path])}`,
			detector: "sign_flip",
			severity: "critical",
			title: `${row.label} has an unexpected sign (${fmt(row.current)})`,
			evidence: {
				rule: isExpense
					? "Expense account with a credit balance"
					: "Revenue account with a debit balance",
				thresholdLabel: "Sign flip",
				currentValue: row.current,
				baselineValue: row.baseline,
				absDelta: row.absDelta,
				pctDelta: row.pctDelta,
			},
			affectedLinePaths: [row.path],
			suggestedAction: `Investigate the underlying transactions — a credit memo, refund, or reclass may have posted to the wrong side.`,
		})
	}
	return out
}

const grossMarginDriftDetector: Detector = ({ thresholds, variance }) => {
	const { current, baseline } = variance.totals
	if (current.income === 0 || baseline.income === 0) {
		return []
	}
	const curGm = (current.grossProfit / current.income) * 100
	const baseGm = (baseline.grossProfit / baseline.income) * 100
	const drift = curGm - baseGm
	if (Math.abs(drift) < thresholds.grossMarginDriftPts) {
		return []
	}
	return [
		{
			id: `gm_drift_${fingerprint([drift.toFixed(1)])}`,
			detector: "gross_margin_drift",
			severity:
				Math.abs(drift) >= thresholds.grossMarginDriftPts * 2
					? "critical"
					: "warn",
			title: `Gross margin moved ${drift >= 0 ? "up" : "down"} ${Math.abs(drift).toFixed(1)} pts (${baseGm.toFixed(1)}% → ${curGm.toFixed(1)}%)`,
			evidence: {
				rule: `|ΔGM%| ≥ ${thresholds.grossMarginDriftPts} pts`,
				thresholdLabel: "Gross margin drift",
				currentValue: curGm,
				baselineValue: baseGm,
				absDelta: drift,
				pctDelta: null,
			},
			affectedLinePaths: [],
			suggestedAction: `Compare COGS and Income lines together: is pricing shifting, mix shifting, or has a COGS category been miscoded into OpEx?`,
		},
	]
}

const oneOffSpikeDetector: Detector = ({ thresholds, variance }) => {
	const out: Finding[] = []
	for (const row of dataRows(variance)) {
		if (
			row.current === null ||
			row.baseline === null ||
			row.baseline === 0 ||
			row.isNewInCurrent ||
			row.isMissingInCurrent
		) {
			continue
		}
		const ratio = row.current / row.baseline
		const meetsMultiplier = Math.abs(ratio) >= thresholds.oneOffMultiplier
		const meetsMinAbs = Math.abs(row.current) >= thresholds.oneOffMinAbs
		if (!meetsMultiplier || !meetsMinAbs) {
			continue
		}
		// Skip the ones already called out as merely material (they'd duplicate) —
		// we only flag here if the multiplier is notably dramatic.
		if (
			ratio < thresholds.oneOffMultiplier * 1.5 &&
			ratio > -thresholds.oneOffMultiplier * 1.5
		) {
			continue
		}
		out.push({
			id: `oneoff_${fingerprint([row.path])}`,
			detector: "one_off_spike",
			severity:
				Math.abs(row.current) >= thresholds.criticalAbs ? "critical" : "warn",
			title: `${row.label} spiked ${ratio.toFixed(1)}× vs baseline (${fmt(row.current)})`,
			evidence: {
				rule: `|current| ≥ ${thresholds.oneOffMultiplier * 1.5}× baseline AND ≥ ${fmt(thresholds.oneOffMinAbs)}`,
				thresholdLabel: "One-off spike",
				currentValue: row.current,
				baselineValue: row.baseline,
				absDelta: row.absDelta,
				pctDelta: row.pctDelta,
			},
			affectedLinePaths: [row.path],
			suggestedAction: `Open the ${row.label} transactions this period — is there a one-time charge that should be reclassified or accrued differently?`,
		})
	}
	return out
}

export const detectors: Detector[] = [
	materialVarianceDetector,
	newLineDetector,
	missingRecurringDetector,
	signFlipDetector,
	grossMarginDriftDetector,
	oneOffSpikeDetector,
]

/**
 * Run every detector against a variance report and return a deduplicated,
 * severity-sorted list of findings.
 */
export function runDetectors(
	variance: VarianceReport,
	thresholds: CloseThresholds = closeThresholds,
): Finding[] {
	const seen = new Map<string, Finding>()
	for (const d of detectors) {
		for (const finding of d({ thresholds, variance })) {
			if (!seen.has(finding.id)) {
				seen.set(finding.id, finding)
			}
		}
	}
	const severityRank: Record<FindingSeverity, number> = {
		critical: 0,
		warn: 1,
		info: 2,
	}
	return [...seen.values()].sort((a, b) => {
		const s = severityRank[a.severity] - severityRank[b.severity]
		if (s !== 0) {
			return s
		}
		return (
			Math.abs(b.evidence.absDelta ?? 0) - Math.abs(a.evidence.absDelta ?? 0)
		)
	})
}
