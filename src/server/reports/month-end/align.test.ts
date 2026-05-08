import { describe, expect, it } from "vitest"
import type { PnlLine } from "@/server/qbo/profit-and-loss"
import {
	alignLines,
	classifyBucket,
	parseMoney,
	pickPeriodValue,
} from "./align"

describe("parseMoney", () => {
	it("parses plain numbers", () => {
		expect(parseMoney("1234.56")).toBe(1234.56)
	})
	it("parses thousands separators", () => {
		expect(parseMoney("1,234,567.89")).toBe(1234567.89)
	})
	it("parses accounting negatives", () => {
		expect(parseMoney("(1,234.56)")).toBe(-1234.56)
	})
	it("parses currency prefixes", () => {
		expect(parseMoney("$-250.00")).toBe(-250)
	})
	it("returns null for blanks", () => {
		expect(parseMoney("")).toBeNull()
		expect(parseMoney("—")).toBeNull()
		expect(parseMoney(null)).toBeNull()
	})
})

describe("pickPeriodValue", () => {
	it("returns the rightmost parsed value", () => {
		expect(pickPeriodValue(["", "100.00", "200.00"])).toBe(200)
	})
	it("skips trailing blanks", () => {
		expect(pickPeriodValue(["100.00", "", ""])).toBe(100)
	})
})

describe("alignLines", () => {
	it("attaches parent section path to data lines", () => {
		const lines: PnlLine[] = [
			{ depth: 0, kind: "section", label: "Income", values: [] },
			{ depth: 1, kind: "data", label: "Sales", values: ["100.00"] },
			{ depth: 1, kind: "summary", label: "Total Income", values: ["100.00"] },
			{ depth: 0, kind: "section", label: "Cost of Goods Sold", values: [] },
			{ depth: 1, kind: "data", label: "Supplies", values: ["30.00"] },
		]
		const a = alignLines(lines)
		const sales = a.find((l) => l.label === "Sales")
		const supplies = a.find((l) => l.label === "Supplies")
		expect(sales?.path).toBe("Income / Sales")
		expect(supplies?.path).toBe("Cost of Goods Sold / Supplies")
		expect(sales?.value).toBe(100)
	})

	it("produces distinct paths for same label in different sections", () => {
		const lines: PnlLine[] = [
			{ depth: 0, kind: "section", label: "Income", values: [] },
			{ depth: 1, kind: "data", label: "Other", values: ["10.00"] },
			{ depth: 0, kind: "section", label: "Expenses", values: [] },
			{ depth: 1, kind: "data", label: "Other", values: ["5.00"] },
		]
		const a = alignLines(lines)
		const paths = a
			.filter((l) => l.kind === "data")
			.map((l) => l.path)
			.sort()
		expect(paths).toEqual(["Expenses / Other", "Income / Other"])
	})
})

describe("classifyBucket", () => {
	it("recognises income, cogs, expense, other", () => {
		const a = alignLines([
			{ depth: 0, kind: "section", label: "Income", values: [] },
			{ depth: 1, kind: "data", label: "Sales", values: ["100"] },
			{ depth: 0, kind: "section", label: "Cost of Goods Sold", values: [] },
			{ depth: 1, kind: "data", label: "Materials", values: ["50"] },
			{ depth: 0, kind: "section", label: "Expenses", values: [] },
			{ depth: 1, kind: "data", label: "Rent", values: ["20"] },
			{ depth: 0, kind: "section", label: "Other Income", values: [] },
			{ depth: 1, kind: "data", label: "Interest", values: ["5"] },
		])
		expect(classifyBucket(a[1])).toBe("income")
		expect(classifyBucket(a[3])).toBe("cogs")
		expect(classifyBucket(a[5])).toBe("expense")
		expect(classifyBucket(a[7])).toBe("other_income")
	})
})
