import "server-only"

import ExcelJS from "exceljs"

const MAX_ROWS_PER_SHEET = 200
const MAX_CHARS = 16_000

/**
 * Best-effort conversion of CSV / XLSX bytes to a compact text representation
 * Claude can read inline. Truncates to keep prompt size sane — the wizard
 * should let the user split very large files before classification.
 */
export async function spreadsheetToText(
	bytes: Buffer,
	mime: string,
): Promise<string> {
	if (mime === "text/csv") {
		return clip(bytes.toString("utf8"))
	}
	const workbook = new ExcelJS.Workbook()
	const ab = bytes.buffer.slice(
		bytes.byteOffset,
		bytes.byteOffset + bytes.byteLength,
	) as ArrayBuffer
	await workbook.xlsx.load(ab)
	return clip(renderWorkbook(workbook))
}

function renderWorkbook(workbook: ExcelJS.Workbook): string {
	const out: string[] = []
	workbook.eachSheet((sheet) => {
		out.push(`# Sheet: ${sheet.name}`)
		let rowCount = 0
		sheet.eachRow({ includeEmpty: false }, (row) => {
			if (rowCount >= MAX_ROWS_PER_SHEET) return
			const cells: string[] = []
			row.eachCell({ includeEmpty: true }, (cell) => {
				cells.push(formatCell(cell.value))
			})
			out.push(cells.join("\t"))
			rowCount += 1
		})
		if (rowCount === MAX_ROWS_PER_SHEET) {
			out.push(`… (truncated at ${MAX_ROWS_PER_SHEET} rows)`)
		}
		out.push("")
	})
	return out.join("\n")
}

function formatCell(value: ExcelJS.CellValue): string {
	if (value == null) return ""
	if (value instanceof Date) return value.toISOString().slice(0, 10)
	if (typeof value === "object") {
		if ("text" in value && typeof value.text === "string") return value.text
		if ("result" in value && value.result != null) return String(value.result)
		if ("richText" in value && Array.isArray(value.richText)) {
			return value.richText.map((r) => r.text ?? "").join("")
		}
	}
	return String(value)
}

function clip(text: string): string {
	if (text.length <= MAX_CHARS) return text
	return `${text.slice(0, MAX_CHARS)}\n… (truncated)`
}
