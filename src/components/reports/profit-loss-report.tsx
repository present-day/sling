"use client"

import { format } from "date-fns"
import Link from "next/link"
import { useCallback, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select"
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table"
import { trpc } from "@/trpc/react"
import { CloseReviewPanel } from "./close-review-panel"

type DateInput = string

function isQuickBooksReconnectError(message: string): boolean {
	return (
		message.includes("invalid_grant") ||
		message.includes("QuickBooks token refresh failed") ||
		message.includes("Token exchange failed")
	)
}

function defaultRange(): { start: DateInput; end: DateInput } {
	const end = new Date()
	const start = new Date(end.getFullYear(), end.getMonth(), 1)
	return {
		start: format(start, "yyyy-MM-dd"),
		end: format(end, "yyyy-MM-dd"),
	}
}

export function ProfitLossReport({ clientId }: { clientId: string }) {
	const dr = useMemo(() => defaultRange(), [])
	const [startDate, setStartDate] = useState(dr.start)
	const [endDate, setEndDate] = useState(dr.end)
	const [accountingMethod, setAccountingMethod] = useState<"Accrual" | "Cash">(
		"Accrual",
	)
	const [summarizeBy, setSummarizeBy] = useState<
		"Total" | "Month" | "Quarter" | "Year" | undefined
	>(undefined)

	const templateQuery = trpc.reports.getBySlug.useQuery({
		slug: "profit-loss",
	})
	const reportQuery = trpc.reports.profitLoss.useQuery(
		{
			clientId,
			startDate,
			endDate,
			accountingMethod,
			...(summarizeBy ? { summarizeColumnBy: summarizeBy } : {}),
		},
		{ enabled: Boolean(startDate && endDate) },
	)

	const utils = trpc.useUtils()

	const applyTemplateDefaults = useCallback(() => {
		const c = templateQuery.data?.config as
			| {
					params?: {
						dateRange?: { from?: string; to?: string } | string
						accountingMethod?: "cash" | "accrual"
						summarizeColumnBy?: typeof summarizeBy
					}
			  }
			| undefined
		if (!c?.params) {
			return
		}
		const dr = c.params.dateRange
		if (typeof dr === "object" && dr?.from && dr?.to) {
			setStartDate(dr.from)
			setEndDate(dr.to)
		}
		if (c.params.accountingMethod) {
			setAccountingMethod(
				c.params.accountingMethod === "cash" ? "Cash" : "Accrual",
			)
		}
		if (c.params.summarizeColumnBy) {
			setSummarizeBy(c.params.summarizeColumnBy)
		}
	}, [templateQuery.data])

	const onUploadPdf: React.ChangeEventHandler<HTMLInputElement> = async (e) => {
		const file = e.target.files?.[0]
		if (!file) {
			return
		}
		const form = new FormData()
		form.append("file", file)
		const res = await fetch("/api/reports/profit-loss-template", {
			method: "POST",
			body: form,
			credentials: "include",
		})
		if (!res.ok) {
			const j = (await res.json().catch(() => ({}))) as { error?: string }
			alert(j.error ?? `Upload failed (${res.status})`)
			return
		}
		await utils.reports.getBySlug.invalidate({ slug: "profit-loss" })
		await utils.reports.list.invalidate()
		await templateQuery.refetch()
		e.target.value = ""
	}

	const lines = reportQuery.data?.lines ?? []
	const columns = reportQuery.data?.columns ?? [{ title: "Amount" }]

	const templateName =
		templateQuery.data?.config &&
		typeof templateQuery.data.config === "object" &&
		templateQuery.data.config !== null &&
		"name" in templateQuery.data.config
			? String((templateQuery.data.config as { name: string }).name)
			: "Profit & Loss"
	const displayTitle = reportQuery.data?.reportName ?? templateName

	return (
		<div className="space-y-6">
			<div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
				<div>
					<h2 className="font-heading text-xl font-semibold">{displayTitle}</h2>
					<p className="text-muted-foreground text-sm">
						{reportQuery.data?.period
							? `${reportQuery.data.period.start} — ${reportQuery.data.period.end}`
							: `${startDate} — ${endDate}`}
						{reportQuery.data?.currency
							? ` · ${reportQuery.data.currency}`
							: ""}
					</p>
				</div>
				<div className="flex flex-wrap items-center gap-2">
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={() => applyTemplateDefaults()}
						disabled={!templateQuery.data}
					>
						Use template defaults
					</Button>
					<div>
						<Label
							htmlFor="pnl-pdf"
							className="text-muted-foreground mb-1 block text-xs"
						>
							Template PDF
						</Label>
						<Input
							id="pnl-pdf"
							type="file"
							accept="application/pdf,.pdf"
							className="max-w-[220px] cursor-pointer text-sm"
							onChange={onUploadPdf}
						/>
					</div>
				</div>
			</div>

			<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
				<div className="space-y-1">
					<Label htmlFor="pnl-start">Start</Label>
					<Input
						id="pnl-start"
						type="date"
						value={startDate}
						onChange={(e) => setStartDate(e.target.value)}
					/>
				</div>
				<div className="space-y-1">
					<Label htmlFor="pnl-end">End</Label>
					<Input
						id="pnl-end"
						type="date"
						value={endDate}
						onChange={(e) => setEndDate(e.target.value)}
					/>
				</div>
				<div className="space-y-1">
					<Label>Basis</Label>
					<Select
						value={accountingMethod}
						onValueChange={(v) => setAccountingMethod(v as "Accrual" | "Cash")}
					>
						<SelectTrigger>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="Accrual">Accrual</SelectItem>
							<SelectItem value="Cash">Cash</SelectItem>
						</SelectContent>
					</Select>
				</div>
				<div className="space-y-1">
					<Label>Columns</Label>
					<Select
						value={summarizeBy ?? "none"}
						onValueChange={(v) =>
							setSummarizeBy(
								v === "none" ? undefined : (v as "Month" | "Quarter" | "Year"),
							)
						}
					>
						<SelectTrigger>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="none">Total only</SelectItem>
							<SelectItem value="Month">By month</SelectItem>
							<SelectItem value="Quarter">By quarter</SelectItem>
							<SelectItem value="Year">By year</SelectItem>
						</SelectContent>
					</Select>
				</div>
			</div>

			{templateQuery.data?.sourcePdfFileName ? (
				<p className="text-muted-foreground text-xs">
					Template file: {templateQuery.data.sourcePdfFileName}
				</p>
			) : null}

			<p className="text-muted-foreground text-xs">
				Open printable{" "}
				<a
					href={`/api/reports/${clientId}/profit-loss/render?start_date=${encodeURIComponent(startDate)}&end_date=${encodeURIComponent(endDate)}&accounting_method=${accountingMethod}${summarizeBy ? `&summarize_column_by=${encodeURIComponent(summarizeBy)}` : ""}`}
					className="text-primary font-medium underline"
					target="_blank"
					rel="noreferrer"
				>
					HTML view
				</a>
			</p>

			<CloseReviewPanel
				clientId={clientId}
				startDate={startDate}
				endDate={endDate}
				accountingMethod={accountingMethod}
			/>

			{reportQuery.isLoading ? (
				<p className="text-muted-foreground text-sm">Loading report…</p>
			) : reportQuery.error ? (
				<div className="space-y-2">
					<p className="text-destructive text-sm">
						{reportQuery.error.message}
					</p>
					{isQuickBooksReconnectError(reportQuery.error.message) ? (
						<p className="text-muted-foreground text-sm">
							<Link
								href={`/api/qbo/oauth/authorize?reconnectClientId=${encodeURIComponent(clientId)}`}
								className="text-primary font-medium underline"
							>
								Reconnect QuickBooks
							</Link>{" "}
							for this client (use the same company; realm must match).
						</p>
					) : null}
				</div>
			) : (
				<div className="rounded-md border">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead className="w-[40%]">Line</TableHead>
								{columns.map((c) => (
									<TableHead
										key={c.title || "amount"}
										className="text-right font-mono text-xs"
									>
										{c.title || "Amount"}
									</TableHead>
								))}
							</TableRow>
						</TableHeader>
						<TableBody>
							{lines.map((line) => (
								<TableRow
									key={`${line.depth}|${line.kind}|${line.label}|${line.values.join("¦")}`}
								>
									<TableCell
										className="font-mono text-xs"
										style={{ paddingLeft: `${8 + line.depth * 12}px` }}
									>
										<span
											className={
												line.kind === "section" || line.kind === "summary"
													? "font-semibold"
													: ""
											}
										>
											{line.label}
										</span>
									</TableCell>
									{columns.map((col, columnIndex) => {
										const v =
											padRowValues(line.values, columns.length)[columnIndex] ??
											""
										return (
											<TableCell
												key={`${line.label}¦${col.title}¦${v}`}
												className="text-right font-mono text-xs tabular-nums"
											>
												{v}
											</TableCell>
										)
									})}
								</TableRow>
							))}
						</TableBody>
					</Table>
				</div>
			)}
		</div>
	)
}

function padRowValues(values: string[], n: number): string[] {
	if (n <= 1) {
		return values.length ? values : [""]
	}
	const out = [...values]
	while (out.length < n) {
		out.push("")
	}
	return out.slice(0, n)
}
