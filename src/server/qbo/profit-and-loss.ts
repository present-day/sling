import "server-only";

import { z } from "zod";
import type { clients } from "@/server/db/schema";
import {
	QBO_MINOR_VERSION,
	quickBooksApiOrigin,
	throwIfQuickBooksFault,
} from "@/server/qbo/intuit-query";
import { getQuickBooksAccessTokenForClient } from "@/server/qbo/get-access-token";

type ClientRow = typeof clients.$inferSelect;

const colDataItemSchema = z.object({
	value: z.string().optional(),
	id: z.string().optional(),
});

function normalizeColDataList(
	input: unknown,
): { value: string; id?: string }[] {
	if (input === undefined || input === null) {
		return [];
	}
	if (Array.isArray(input)) {
		return input.map((c) => {
			const p = colDataItemSchema.safeParse(c);
			if (p.success) {
				return { value: p.data.value ?? "", id: p.data.id };
			}
			return { value: String(c) };
		});
	}
	if (typeof input === "object") {
		const p = colDataItemSchema.safeParse(input);
		if (!p.success) {
			return [];
		}
		return [{ value: p.data.value ?? "", id: p.data.id }];
	}
	return [];
}

function cellStrings(cols: { value: string; id?: string }[]): string[] {
	return cols.map((c) => c.value ?? "");
}

export type PnlLineKind = "section" | "data" | "summary" | "header";

export type PnlLine = {
	depth: number;
	kind: PnlLineKind;
	label: string;
	values: string[];
};

function processRowNode(row: unknown, depth: number, out: PnlLine[]): void {
	if (row === null || row === undefined) {
		return;
	}
	if (Array.isArray(row)) {
		for (const r of row) {
			processRowNode(r, depth, out);
		}
		return;
	}
	if (typeof row !== "object") {
		return;
	}

	const r = row as Record<string, unknown>;
	const t = r.type;
	const colData = normalizeColDataList(r.ColData);
	const cells = cellStrings(colData);
	const group = typeof r.group === "string" ? r.group : undefined;

	const walkNested = () => {
		if (r.Rows !== undefined) {
			unwrapRowsContainer(r.Rows, depth + 1, out);
		}
		if (r.Summary !== undefined) {
			processRowNode(r.Summary, depth + 1, out);
		}
	};

	if (t === "Section") {
		if (r.Header && typeof r.Header === "object") {
			const h = r.Header as Record<string, unknown>;
			const hCells = cellStrings(normalizeColDataList(h.ColData));
			const label = hCells[0] || group || "Section";
			out.push({
				depth,
				kind: "section",
				label,
				values: hCells.length > 1 ? hCells.slice(1) : cells,
			});
		} else {
			out.push({
				depth,
				kind: "section",
				label: group || "Section",
				values: cells,
			});
		}
		walkNested();
		return;
	}

	if (t === "Header") {
		const label = cells[0] || "Header";
		out.push({ depth, kind: "header", label, values: cells });
		walkNested();
		return;
	}

	if (t === "Summary" || t === "Total") {
		const label = cells[0] || t || (group ? `Total — ${group}` : "Total");
		out.push({ depth, kind: "summary", label, values: cells });
		return;
	}

	if (t === "Data") {
		const label = cells[0] ?? "";
		out.push({
			depth,
			kind: "data",
			label,
			values: cells.slice(1),
		});
		walkNested();
		return;
	}

	/* ColData with no type — treat as a data line */
	if (colData.length > 0) {
		const label = cells[0] ?? group ?? "";
		out.push({
			depth,
			kind: "data",
			label: label || "—",
			values: cells.slice(1),
		});
	}
	walkNested();
}

function unwrapRowsContainer(
	rows: unknown,
	depth: number,
	out: PnlLine[],
): void {
	if (rows === null || rows === undefined) {
		return;
	}
	if (Array.isArray(rows)) {
		for (const r of rows) {
			processRowNode(r, depth, out);
		}
		return;
	}
	if (typeof rows === "object") {
		const o = rows as Record<string, unknown>;
		if ("Row" in o) {
			const inner = o.Row;
			if (Array.isArray(inner)) {
				for (const r of inner) {
					processRowNode(r, depth, out);
				}
			} else {
				processRowNode(inner, depth, out);
			}
		}
	}
}

const reportHeaderSchema = z.object({}).catchall(z.unknown());

const profitAndLossReportBodySchema = z
	.object({
		Header: reportHeaderSchema.optional(),
		Columns: z.unknown().optional(),
		Rows: z.unknown().optional(),
	})
	.passthrough();

export type ProfitAndLossReport = z.infer<
	typeof profitAndLossReportBodySchema
> & {
	normalizedLines: PnlLine[];
	columns: { title: string }[];
};

function parseColumnsForTitles(columns: unknown): { title: string }[] {
	if (!columns || typeof columns !== "object") {
		return [];
	}
	const c = columns as { Column?: unknown };
	const colList = c.Column;
	const arr = Array.isArray(colList) ? colList : colList ? [colList] : [];
	return arr.map((col) => {
		if (col && typeof col === "object" && "ColTitle" in col) {
			const t = (col as { ColTitle: unknown }).ColTitle;
			return { title: typeof t === "string" ? t : String(t ?? "") };
		}
		return { title: "" };
	});
}

function parseReportName(header: unknown): string {
	if (!header || typeof header !== "object") {
		return "Profit and Loss";
	}
	const h = header as { ReportName?: string };
	return typeof h.ReportName === "string" ? h.ReportName : "Profit and Loss";
}

export function normalizeQuickBooksPnl(
	raw: z.infer<typeof profitAndLossReportBodySchema>,
): { lines: PnlLine[]; columns: { title: string }[]; reportName: string } {
	const lines: PnlLine[] = [];
	if (raw.Rows !== undefined) {
		unwrapRowsContainer(raw.Rows, 0, lines);
	}
	return {
		lines,
		columns: parseColumnsForTitles((raw as { Columns?: unknown }).Columns),
		reportName: parseReportName(raw.Header),
	};
}

/**
 * Fetches the QuickBooks Profit and Loss report and returns a validated body plus
 * flattened lines for table rendering.
 */
export async function fetchProfitAndLossReport(options: {
	client: ClientRow;
	startDate: string;
	endDate: string;
	accountingMethod?: "Cash" | "Accrual";
	summarizeColumnBy?: "Total" | "Month" | "Week" | "Days" | "Quarter" | "Year";
}): Promise<ProfitAndLossReport> {
	const { client, startDate, endDate } = options;
	const accessToken = await getQuickBooksAccessTokenForClient(client);
	const origin = quickBooksApiOrigin(client.environment);
	const url = new URL(
		`/v3/company/${client.realmId}/reports/ProfitAndLoss`,
		origin,
	);
	url.searchParams.set("start_date", startDate);
	url.searchParams.set("end_date", endDate);
	url.searchParams.set("minorversion", QBO_MINOR_VERSION);
	if (options.accountingMethod) {
		url.searchParams.set("accounting_method", options.accountingMethod);
	}
	if (options.summarizeColumnBy) {
		url.searchParams.set("summarize_column_by", options.summarizeColumnBy);
	}

	const res = await fetch(url, {
		headers: {
			Authorization: `Bearer ${accessToken}`,
			Accept: "application/json",
		},
	});
	const text = await res.text();
	let json: unknown;
	try {
		json = JSON.parse(text) as unknown;
	} catch {
		throw new Error(
			`QuickBooks ProfitAndLoss: invalid JSON (${res.status}): ${text.slice(0, 200)}`,
		);
	}
	throwIfQuickBooksFault(json);
	if (!res.ok) {
		throw new Error(
			`QuickBooks ProfitAndLoss failed: ${res.status} ${
				typeof json === "object" && json !== null ? JSON.stringify(json) : text
			}`,
		);
	}

	const top =
		typeof json === "object" && json !== null
			? (json as Record<string, unknown>)
			: null;
	if (!top) {
		throw new Error("QuickBooks ProfitAndLoss: empty response");
	}

	const bodyRaw =
		"Report" in top && top.Report && typeof top.Report === "object"
			? top.Report
			: json;

	const body = profitAndLossReportBodySchema.parse(bodyRaw);
	const { lines, columns, reportName } = normalizeQuickBooksPnl(body);

	return {
		...body,
		Header: {
			...((body.Header as Record<string, unknown> | undefined) ?? {}),
			ReportName: reportName,
		},
		normalizedLines: lines,
		columns: columns.length ? columns : [{ title: "Amount" }],
	};
}
