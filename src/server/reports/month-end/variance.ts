import type { PnlLine, PnlLineKind } from "@/server/qbo/profit-and-loss";
import { type AlignedLine, alignLines, classifyBucket } from "./align";
import type { Baseline } from "./types";

export type VarianceRow = {
	path: string;
	label: string;
	kind: PnlLineKind;
	bucket: ReturnType<typeof classifyBucket>;
	current: number | null;
	baseline: number | null;
	absDelta: number | null;
	pctDelta: number | null;
	/** `true` when this path exists in current but not baseline (or vice versa). */
	isNewInCurrent: boolean;
	isMissingInCurrent: boolean;
};

export type VarianceReport = {
	baselineId: string;
	rows: VarianceRow[];
	/** Summary totals computed by bucket for quick top-line figures. */
	totals: {
		current: BucketTotals;
		baseline: BucketTotals;
	};
};

export type BucketTotals = {
	income: number;
	cogs: number;
	grossProfit: number;
	expense: number;
	netOperating: number;
	otherIncome: number;
	otherExpense: number;
	netIncome: number;
};

function sumDataLinesByBucket(aligned: AlignedLine[]): BucketTotals {
	const t: BucketTotals = {
		income: 0,
		cogs: 0,
		grossProfit: 0,
		expense: 0,
		netOperating: 0,
		otherIncome: 0,
		otherExpense: 0,
		netIncome: 0,
	};
	for (const line of aligned) {
		if (line.kind !== "data" || line.value === null) {
			continue;
		}
		const bucket = classifyBucket(line);
		if (bucket === "income") {
			t.income += line.value;
		} else if (bucket === "cogs") {
			t.cogs += line.value;
		} else if (bucket === "expense") {
			t.expense += line.value;
		} else if (bucket === "other_income") {
			t.otherIncome += line.value;
		} else if (bucket === "other_expense") {
			t.otherExpense += line.value;
		}
	}
	t.grossProfit = t.income - t.cogs;
	t.netOperating = t.grossProfit - t.expense;
	t.netIncome = t.netOperating + t.otherIncome - t.otherExpense;
	return t;
}

function pctDelta(
	current: number | null,
	baseline: number | null,
): number | null {
	if (current === null || baseline === null) {
		return null;
	}
	if (baseline === 0) {
		return current === 0 ? 0 : null;
	}
	return ((current - baseline) / Math.abs(baseline)) * 100;
}

/**
 * Pure: given aligned current + baseline lines, emit a variance row per distinct path.
 */
export function computeVariance(
	current: PnlLine[],
	baseline: Baseline,
): VarianceReport {
	const alignedCurrent = alignLines(current);
	const alignedBaseline = alignLines(baseline.lines);

	const byPath = new Map<string, { c?: AlignedLine; b?: AlignedLine }>();
	for (const line of alignedCurrent) {
		byPath.set(line.path, { ...byPath.get(line.path), c: line });
	}
	for (const line of alignedBaseline) {
		byPath.set(line.path, { ...byPath.get(line.path), b: line });
	}

	const rows: VarianceRow[] = [];
	for (const [path, pair] of byPath) {
		const anchor = pair.c ?? pair.b;
		if (!anchor) {
			continue;
		}
		const cur = pair.c?.value ?? null;
		const base = pair.b?.value ?? null;
		const abs = cur !== null && base !== null ? cur - base : null;
		rows.push({
			path,
			label: anchor.label,
			kind: anchor.kind,
			bucket: classifyBucket(anchor),
			current: cur,
			baseline: base,
			absDelta: abs,
			pctDelta: pctDelta(cur, base),
			isNewInCurrent: Boolean(pair.c) && !pair.b,
			isMissingInCurrent: !pair.c && Boolean(pair.b),
		});
	}

	return {
		baselineId: baseline.id,
		rows,
		totals: {
			current: sumDataLinesByBucket(alignedCurrent),
			baseline: sumDataLinesByBucket(alignedBaseline),
		},
	};
}
