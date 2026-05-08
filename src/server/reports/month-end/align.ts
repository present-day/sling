import type { PnlLine, PnlLineKind } from "@/server/qbo/profit-and-loss"

export type AlignedLine = {
	path: string
	depth: number
	kind: PnlLineKind
	label: string
	/** Section hierarchy the line sits under, top-down (excluding the line itself). */
	sectionPath: string[]
	/** Parsed period total (from the rightmost monetary column). */
	value: number | null
}

/**
 * Strip currency formatting and parse to a number.
 * Handles `$1,234.56`, `(1,234.56)` (accounting negatives), trailing `%`, and empty.
 */
export function parseMoney(raw: string | undefined | null): number | null {
	if (raw === undefined || raw === null) {
		return null
	}
	const trimmed = raw.trim()
	if (trimmed === "" || trimmed === "-" || trimmed === "—") {
		return null
	}
	let working = trimmed
	let negative = false
	if (working.startsWith("(") && working.endsWith(")")) {
		negative = true
		working = working.slice(1, -1)
	}
	working = working.replace(/[^0-9.-]/g, "")
	if (working === "" || working === "-" || working === ".") {
		return null
	}
	const n = Number(working)
	if (!Number.isFinite(n)) {
		return null
	}
	return negative ? -Math.abs(n) : n
}

/** Pick the rightmost non-empty value as the period total. */
export function pickPeriodValue(values: string[]): number | null {
	for (let i = values.length - 1; i >= 0; i -= 1) {
		const parsed = parseMoney(values[i])
		if (parsed !== null) {
			return parsed
		}
	}
	return null
}

/**
 * Walk the flattened PnlLine[] in document order and compute a stable `path` key
 * per line by tracking the current section stack using depth transitions.
 */
export function alignLines(lines: PnlLine[]): AlignedLine[] {
	const out: AlignedLine[] = []
	const stack: { depth: number; label: string }[] = []

	for (const line of lines) {
		while (stack.length > 0 && stack[stack.length - 1].depth >= line.depth) {
			stack.pop()
		}

		const sectionPath = stack.map((s) => s.label)
		const isSummary = line.kind === "summary"
		const pathSegments = isSummary
			? [...sectionPath, `Σ ${line.label}`]
			: [...sectionPath, line.label]
		const path = pathSegments.join(" / ")

		out.push({
			path,
			depth: line.depth,
			kind: line.kind,
			label: line.label,
			sectionPath,
			value: pickPeriodValue(line.values),
		})

		if (line.kind === "section" || line.kind === "header") {
			stack.push({ depth: line.depth, label: line.label })
		}
	}

	return out
}

/**
 * Heuristic classifier for a line's top-level section. Returns one of
 * a few canonical buckets so detectors can reason about gross margin, etc.
 */
export function classifyBucket(
	line: AlignedLine,
):
	| "income"
	| "cogs"
	| "expense"
	| "other_income"
	| "other_expense"
	| "unknown" {
	const root = (line.sectionPath[0] ?? line.label).toLowerCase()
	if (root.includes("cost of goods") || root.includes("cost of sales")) {
		return "cogs"
	}
	if (root.includes("other income")) {
		return "other_income"
	}
	if (root.includes("other expense")) {
		return "other_expense"
	}
	if (
		root.includes("income") ||
		root.includes("revenue") ||
		root.includes("sales")
	) {
		return "income"
	}
	if (root.includes("expense")) {
		return "expense"
	}
	return "unknown"
}
