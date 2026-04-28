import { describe, expect, it } from "vitest";
import type { PnlLine } from "@/server/qbo/profit-and-loss";
import type { Baseline } from "./types";
import { computeVariance } from "./variance";

function makeLines(
	rows: {
		depth: number;
		kind: PnlLine["kind"];
		label: string;
		value?: string;
	}[],
): PnlLine[] {
	return rows.map((r) => ({
		depth: r.depth,
		kind: r.kind,
		label: r.label,
		values: r.value === undefined ? [] : [r.value],
	}));
}

function makeBaseline(lines: PnlLine[]): Baseline {
	return {
		id: "prior-month",
		label: "Prior month",
		period: { start: "2024-12-01", end: "2024-12-31" },
		lines,
		columns: [{ title: "Total" }],
	};
}

describe("computeVariance", () => {
	it("pairs matching paths and computes abs + pct delta", () => {
		const current = makeLines([
			{ depth: 0, kind: "section", label: "Income" },
			{ depth: 1, kind: "data", label: "Sales", value: "1500.00" },
			{ depth: 0, kind: "section", label: "Expenses" },
			{ depth: 1, kind: "data", label: "Rent", value: "1000.00" },
		]);
		const baseline = makeBaseline(
			makeLines([
				{ depth: 0, kind: "section", label: "Income" },
				{ depth: 1, kind: "data", label: "Sales", value: "1000.00" },
				{ depth: 0, kind: "section", label: "Expenses" },
				{ depth: 1, kind: "data", label: "Rent", value: "1000.00" },
			]),
		);
		const v = computeVariance(current, baseline);
		const sales = v.rows.find((r) => r.label === "Sales");
		expect(sales?.absDelta).toBe(500);
		expect(sales?.pctDelta).toBe(50);
		const rent = v.rows.find((r) => r.label === "Rent");
		expect(rent?.absDelta).toBe(0);
		expect(rent?.pctDelta).toBe(0);
	});

	it("flags new and missing lines", () => {
		const current = makeLines([
			{ depth: 0, kind: "section", label: "Expenses" },
			{ depth: 1, kind: "data", label: "Consulting", value: "800.00" },
		]);
		const baseline = makeBaseline(
			makeLines([
				{ depth: 0, kind: "section", label: "Expenses" },
				{ depth: 1, kind: "data", label: "Rent", value: "1200.00" },
			]),
		);
		const v = computeVariance(current, baseline);
		const consulting = v.rows.find((r) => r.label === "Consulting");
		const rent = v.rows.find((r) => r.label === "Rent");
		expect(consulting?.isNewInCurrent).toBe(true);
		expect(consulting?.isMissingInCurrent).toBe(false);
		expect(rent?.isMissingInCurrent).toBe(true);
		expect(rent?.isNewInCurrent).toBe(false);
	});

	it("computes bucket totals and gross profit", () => {
		const lines = makeLines([
			{ depth: 0, kind: "section", label: "Income" },
			{ depth: 1, kind: "data", label: "Sales", value: "1000.00" },
			{ depth: 0, kind: "section", label: "Cost of Goods Sold" },
			{ depth: 1, kind: "data", label: "Materials", value: "300.00" },
			{ depth: 0, kind: "section", label: "Expenses" },
			{ depth: 1, kind: "data", label: "Rent", value: "200.00" },
		]);
		const v = computeVariance(lines, makeBaseline(lines));
		expect(v.totals.current.income).toBe(1000);
		expect(v.totals.current.cogs).toBe(300);
		expect(v.totals.current.grossProfit).toBe(700);
		expect(v.totals.current.expense).toBe(200);
		expect(v.totals.current.netIncome).toBe(500);
	});

	it("handles zero baseline without crashing", () => {
		const current = makeLines([
			{ depth: 0, kind: "section", label: "Income" },
			{ depth: 1, kind: "data", label: "Sales", value: "500.00" },
		]);
		const baseline = makeBaseline(
			makeLines([
				{ depth: 0, kind: "section", label: "Income" },
				{ depth: 1, kind: "data", label: "Sales", value: "0.00" },
			]),
		);
		const v = computeVariance(current, baseline);
		const sales = v.rows.find((r) => r.label === "Sales");
		expect(sales?.absDelta).toBe(500);
		expect(sales?.pctDelta).toBeNull();
	});
});
