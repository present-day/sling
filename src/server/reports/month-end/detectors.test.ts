import { describe, expect, it } from "vitest"
import type { PnlLine } from "@/server/qbo/profit-and-loss"
import { runDetectors } from "./detectors"
import type { Baseline } from "./types"
import { computeVariance } from "./variance"

function makeLines(
	rows: {
		depth: number
		kind: PnlLine["kind"]
		label: string
		value?: string
	}[],
): PnlLine[] {
	return rows.map((r) => ({
		depth: r.depth,
		kind: r.kind,
		label: r.label,
		values: r.value === undefined ? [] : [r.value],
	}))
}

function baselineFrom(lines: PnlLine[]): Baseline {
	return {
		id: "prior-month",
		label: "Prior month",
		period: { start: "2024-12-01", end: "2024-12-31" },
		lines,
		columns: [{ title: "Total" }],
	}
}

describe("runDetectors", () => {
	it("flags material variance and respects the materiality floor", () => {
		const current = makeLines([
			{ depth: 0, kind: "section", label: "Expenses" },
			{ depth: 1, kind: "data", label: "Rent", value: "2000.00" },
			{ depth: 1, kind: "data", label: "Paperclips", value: "40.00" },
		])
		const baseline = baselineFrom(
			makeLines([
				{ depth: 0, kind: "section", label: "Expenses" },
				{ depth: 1, kind: "data", label: "Rent", value: "1000.00" },
				{ depth: 1, kind: "data", label: "Paperclips", value: "5.00" },
			]),
		)
		const findings = runDetectors(computeVariance(current, baseline))
		const detectors = findings.map((f) => f.detector)
		expect(detectors).toContain("material_variance")
		// Paperclips moved 700% but only $35 — below materiality floor.
		const paperclips = findings.find((f) =>
			f.affectedLinePaths.includes("Expenses / Paperclips"),
		)
		expect(paperclips?.detector).not.toBe("material_variance")
	})

	it("flags new lines above the minimum and ignores tiny ones", () => {
		const current = makeLines([
			{ depth: 0, kind: "section", label: "Expenses" },
			{ depth: 1, kind: "data", label: "Consulting", value: "2500.00" },
			{ depth: 1, kind: "data", label: "Donuts", value: "12.00" },
		])
		const baseline = baselineFrom(
			makeLines([
				{ depth: 0, kind: "section", label: "Expenses" },
				{ depth: 1, kind: "data", label: "Rent", value: "1000.00" },
			]),
		)
		const findings = runDetectors(computeVariance(current, baseline))
		const newLineFindings = findings.filter((f) => f.detector === "new_line")
		expect(newLineFindings.map((f) => f.affectedLinePaths[0])).toEqual([
			"Expenses / Consulting",
		])
	})

	it("flags missing recurring expenses", () => {
		const current = makeLines([
			{ depth: 0, kind: "section", label: "Expenses" },
			{ depth: 1, kind: "data", label: "Rent", value: "0.00" },
		])
		const baseline = baselineFrom(
			makeLines([
				{ depth: 0, kind: "section", label: "Expenses" },
				{ depth: 1, kind: "data", label: "Rent", value: "1200.00" },
			]),
		)
		const findings = runDetectors(computeVariance(current, baseline))
		expect(findings.some((f) => f.detector === "missing_recurring")).toBe(true)
	})

	it("flags sign flips on expense accounts", () => {
		const current = makeLines([
			{ depth: 0, kind: "section", label: "Expenses" },
			{ depth: 1, kind: "data", label: "Rent", value: "(500.00)" },
		])
		const baseline = baselineFrom(
			makeLines([
				{ depth: 0, kind: "section", label: "Expenses" },
				{ depth: 1, kind: "data", label: "Rent", value: "500.00" },
			]),
		)
		const findings = runDetectors(computeVariance(current, baseline))
		const signFlip = findings.find((f) => f.detector === "sign_flip")
		expect(signFlip).toBeDefined()
		expect(signFlip?.severity).toBe("critical")
	})

	it("flags gross margin drift", () => {
		const current = makeLines([
			{ depth: 0, kind: "section", label: "Income" },
			{ depth: 1, kind: "data", label: "Sales", value: "10000.00" },
			{ depth: 0, kind: "section", label: "Cost of Goods Sold" },
			{ depth: 1, kind: "data", label: "Materials", value: "6000.00" },
		])
		const baseline = baselineFrom(
			makeLines([
				{ depth: 0, kind: "section", label: "Income" },
				{ depth: 1, kind: "data", label: "Sales", value: "10000.00" },
				{ depth: 0, kind: "section", label: "Cost of Goods Sold" },
				{ depth: 1, kind: "data", label: "Materials", value: "3000.00" },
			]),
		)
		const findings = runDetectors(computeVariance(current, baseline))
		expect(findings.some((f) => f.detector === "gross_margin_drift")).toBe(true)
	})

	it("sorts critical before warn", () => {
		const current = makeLines([
			{ depth: 0, kind: "section", label: "Expenses" },
			{ depth: 1, kind: "data", label: "Rent", value: "2000.00" },
			{ depth: 1, kind: "data", label: "Payroll", value: "(8000.00)" },
		])
		const baseline = baselineFrom(
			makeLines([
				{ depth: 0, kind: "section", label: "Expenses" },
				{ depth: 1, kind: "data", label: "Rent", value: "1000.00" },
				{ depth: 1, kind: "data", label: "Payroll", value: "7000.00" },
			]),
		)
		const findings = runDetectors(computeVariance(current, baseline))
		expect(findings[0]?.severity).toBe("critical")
	})
})
