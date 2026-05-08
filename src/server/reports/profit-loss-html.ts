import "server-only"

import type { PnlLine } from "@/server/qbo/profit-and-loss"

function escapeHtml(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
}

function padValues(values: string[], n: number): string[] {
	const out = [...values]
	while (out.length < n) {
		out.push("")
	}
	return out.slice(0, n)
}

export function buildProfitLossHtml(data: {
	reportName: string
	period: { start: string; end: string }
	currency?: string
	columns: { title: string }[]
	lines: PnlLine[]
}): string {
	const { reportName, period, currency, columns, lines } = data
	const n = Math.max(1, columns.length)
	const rows = lines
		.map((line) => {
			const indent = 8 + line.depth * 14
			const weight =
				line.kind === "section" || line.kind === "summary"
					? "font-weight:600"
					: "font-weight:400"
			const vals = padValues(line.values, n)
			const cells = vals
				.map(
					(v) =>
						`<td style="text-align:right;font-family:ui-monospace,monospace;font-size:12px;padding:4px 8px">${escapeHtml(v)}</td>`,
				)
				.join("")
			return `<tr><td style="padding:4px 8px;padding-left:${indent}px;font-family:ui-monospace,monospace;font-size:12px;${weight}">${escapeHtml(line.label)}</td>${cells}</tr>`
		})
		.join("\n")
	const headerCells = columns
		.map(
			(c, i) =>
				`<th style="text-align:right;font-size:12px;padding:8px">${escapeHtml(c.title || `Col ${i + 1}`)}</th>`,
		)
		.join("")
	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>${escapeHtml(reportName)}</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 24px; color: #111; }
  h1 { font-size: 20px; margin-bottom: 4px; }
  p.meta { color: #555; font-size: 13px; margin-top: 0; }
  table { border-collapse: collapse; width: 100%; max-width: 960px; }
  th { text-align: left; border-bottom: 1px solid #ccc; }
  td, th { vertical-align: top; }
</style>
</head>
<body>
<h1>${escapeHtml(reportName)}</h1>
<p class="meta">${escapeHtml(period.start)} — ${escapeHtml(period.end)}${currency ? ` · ${escapeHtml(currency)}` : ""}</p>
<table>
<thead>
<tr><th style="text-align:left;font-size:12px;padding:8px">Line</th>${headerCells}</tr>
</thead>
<tbody>
${rows}
</tbody>
</table>
</body>
</html>`
}
