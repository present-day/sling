"use client"

import { format } from "date-fns"
import {
	AlertTriangleIcon,
	CheckIcon,
	MessageSquareIcon,
	PlayIcon,
	StickyNoteIcon,
	TrashIcon,
} from "lucide-react"
import type { ReactNode } from "react"
import { useCallback, useMemo, useState } from "react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { trpc } from "@/trpc/react"
import { CloseChatSheet } from "./close-chat-sheet"

type Disposition = "accepted" | "dismissed" | "noted"
type Severity = "info" | "warn" | "critical"

type Finding = {
	id: string
	detector: string
	severity: Severity
	title: string
	evidence: {
		rule: string
		thresholdLabel: string
		currentValue: number | null
		baselineValue: number | null
		absDelta: number | null
		pctDelta: number | null
	}
	affectedLinePaths: string[]
	suggestedAction: string
}

export function CloseReviewPanel({
	clientId,
	startDate,
	endDate,
	accountingMethod,
}: {
	clientId: string
	startDate: string
	endDate: string
	accountingMethod: "Accrual" | "Cash"
}) {
	const utils = trpc.useUtils()

	const latestQuery = trpc.monthEndClose.getLatestForPeriod.useQuery(
		{ clientId, startDate, endDate },
		{ enabled: Boolean(clientId && startDate && endDate) },
	)

	const historyQuery = trpc.monthEndClose.listByClient.useQuery(
		{ clientId, limit: 10 },
		{ enabled: Boolean(clientId) },
	)

	const runMutation = trpc.monthEndClose.run.useMutation({
		onSuccess: async () => {
			toast.success("Close run complete")
			await utils.monthEndClose.getLatestForPeriod.invalidate({
				clientId,
				startDate,
				endDate,
			})
			await utils.monthEndClose.listByClient.invalidate({ clientId })
		},
		onError: (e) => {
			toast.error(e.message)
		},
	})

	const dispositionMutation = trpc.monthEndClose.setDisposition.useMutation({
		onSuccess: async () => {
			await utils.monthEndClose.getLatestForPeriod.invalidate({
				clientId,
				startDate,
				endDate,
			})
		},
	})

	const [chatOpen, setChatOpen] = useState(false)

	const onRun = useCallback(() => {
		runMutation.mutate({
			clientId,
			startDate,
			endDate,
			accountingMethod,
		})
	}, [runMutation, clientId, startDate, endDate, accountingMethod])

	const close = latestQuery.data ?? null
	const findings = (close?.findings ?? []) as Finding[]

	const dispositionsByFinding = useMemo(() => {
		const m = new Map<
			string,
			{ disposition: Disposition; note: string | null }
		>()
		for (const d of close?.dispositions ?? []) {
			m.set(d.findingId, { disposition: d.disposition, note: d.note })
		}
		return m
	}, [close?.dispositions])

	const severityOrder: Record<Severity, number> = {
		critical: 0,
		warn: 1,
		info: 2,
	}
	const sortedFindings = [...findings].sort(
		(a, b) => severityOrder[a.severity] - severityOrder[b.severity],
	)

	const activeFindingIds = new Set(
		findings
			.filter(
				(f) => dispositionsByFinding.get(f.id)?.disposition !== "dismissed",
			)
			.map((f) => f.id),
	)

	return (
		<div className="space-y-4">
			<Card>
				<CardHeader>
					<CardTitle>Month-end close review</CardTitle>
					<CardDescription>
						Runs deterministic variance + anomaly detectors against the prior
						month, then has Claude narrate the findings. Each sentence anchors
						back to a finding card below.
					</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-wrap items-center justify-between gap-3">
					<div className="flex flex-col gap-1 text-xs text-muted-foreground">
						<span>
							Period <span className="font-mono">{startDate}</span> —{" "}
							<span className="font-mono">{endDate}</span> · {accountingMethod}
						</span>
						{close ? (
							<span>
								Last run{" "}
								{format(close.createdAt, "MMM d, yyyy h:mma").toLowerCase()} ·{" "}
								{close.findings.length} finding
								{close.findings.length === 1 ? "" : "s"} ·{" "}
								{close.narrative.modelVersion === "none"
									? "no narrative needed"
									: `model ${close.narrative.modelVersion}`}
							</span>
						) : (
							<span>No close run yet for this period.</span>
						)}
					</div>
					<div className="flex items-center gap-2">
						{close ? (
							<Button
								type="button"
								variant="outline"
								size="sm"
								onClick={() => setChatOpen(true)}
							>
								<MessageSquareIcon /> Chat with close context
							</Button>
						) : null}
						<Button
							type="button"
							size="sm"
							onClick={onRun}
							disabled={runMutation.isPending}
						>
							<PlayIcon />
							{runMutation.isPending
								? "Running…"
								: close
									? "Re-run close"
									: "Run month-end close"}
						</Button>
					</div>
				</CardContent>
			</Card>

			{latestQuery.isLoading ? (
				<p className="text-sm text-muted-foreground">Loading latest close…</p>
			) : null}

			{close ? (
				<>
					<Card>
						<CardHeader>
							<CardTitle className="flex items-center gap-2">
								Narrative
								<Badge variant="outline" className="font-mono text-[10px]">
									{close.baselineKey}
								</Badge>
							</CardTitle>
							<CardDescription>
								Produced from the findings list below. Citations in{" "}
								<span className="font-mono">[brackets]</span> link to the card
								with the rule + the numbers that fired it.
							</CardDescription>
						</CardHeader>
						<CardContent>
							<NarrativeBody
								summary={close.narrative.summary}
								activeFindingIds={activeFindingIds}
							/>
						</CardContent>
					</Card>

					<section className="space-y-3">
						<div className="flex items-center justify-between">
							<h3 className="font-heading text-base font-medium">
								Findings ({sortedFindings.length})
							</h3>
							<span className="text-xs text-muted-foreground">
								Deterministic detectors · thresholds visible on each card
							</span>
						</div>
						{sortedFindings.length === 0 ? (
							<Card>
								<CardContent className="py-6 text-sm text-muted-foreground">
									No anomalies flagged — the detectors ran but nothing crossed
									the materiality thresholds.
								</CardContent>
							</Card>
						) : null}
						{sortedFindings.map((f) => (
							<FindingCard
								key={f.id}
								finding={f}
								commentary={close.narrative.perFindingComments[f.id]}
								disposition={dispositionsByFinding.get(f.id) ?? null}
								pending={
									dispositionMutation.isPending &&
									dispositionMutation.variables?.findingId === f.id
								}
								onDisposition={(disposition, note) =>
									dispositionMutation.mutate({
										closeId: close.id,
										findingId: f.id,
										disposition,
										note: note ?? null,
									})
								}
							/>
						))}
					</section>
				</>
			) : null}

			{(historyQuery.data?.length ?? 0) > 1 ? (
				<Card size="sm">
					<CardHeader>
						<CardTitle>Recent closes for this client</CardTitle>
					</CardHeader>
					<CardContent>
						<ul className="space-y-1 text-xs text-muted-foreground">
							{historyQuery.data?.map((h) => (
								<li
									key={h.id}
									className="flex items-center justify-between font-mono"
								>
									<span>
										{h.periodStart} — {h.periodEnd}
									</span>
									<span>
										{format(h.createdAt, "MMM d, yyyy").toLowerCase()} ·{" "}
										{h.status}
									</span>
								</li>
							))}
						</ul>
					</CardContent>
				</Card>
			) : null}

			{close ? (
				<CloseChatSheet
					closeId={close.id}
					open={chatOpen}
					onOpenChange={setChatOpen}
					periodLabel={`${close.periodStart} — ${close.periodEnd}`}
				/>
			) : null}
		</div>
	)
}

function NarrativeBody({
	summary,
	activeFindingIds,
}: {
	summary: string
	activeFindingIds: Set<string>
}) {
	const tokens = summary.split(/(\[[^\]]+\])/g)
	const rendered: ReactNode[] = []
	let offset = 0
	for (const t of tokens) {
		const m = t.match(/^\[([^\]]+)\]$/)
		const start = offset
		offset += t.length
		if (!m) {
			rendered.push(<span key={`t-${start}-${t.length}`}>{t}</span>)
			continue
		}
		const id = m[1]
		const known = activeFindingIds.has(id)
		rendered.push(
			<button
				type="button"
				key={`chip-${start}-${id}`}
				className={`mx-0.5 inline-flex items-center rounded-md px-1.5 py-0.5 font-mono text-[11px] ${
					known
						? "bg-muted text-foreground hover:bg-foreground/10"
						: "bg-muted/50 text-muted-foreground line-through"
				}`}
				onClick={() => {
					if (!known) {
						return
					}
					document
						.getElementById(`finding-${id}`)
						?.scrollIntoView({ behavior: "smooth", block: "center" })
				}}
				title={known ? "Jump to finding" : "Finding not in this run"}
			>
				{id}
			</button>,
		)
	}
	return (
		<p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
			{rendered}
		</p>
	)
}

function fmtMoney(n: number | null): string {
	if (n === null) {
		return "—"
	}
	const sign = n < 0 ? "-" : ""
	return `${sign}$${Math.abs(n).toLocaleString(undefined, {
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

function severityBadgeVariant(
	s: Severity,
): "destructive" | "secondary" | "outline" {
	if (s === "critical") {
		return "destructive"
	}
	if (s === "warn") {
		return "secondary"
	}
	return "outline"
}

function FindingCard({
	finding,
	commentary,
	disposition,
	pending,
	onDisposition,
}: {
	finding: Finding
	commentary?: string
	disposition: { disposition: Disposition; note: string | null } | null
	pending: boolean
	onDisposition: (d: Disposition, note?: string | null) => void
}) {
	const [noteDraft, setNoteDraft] = useState(disposition?.note ?? "")
	const [noteOpen, setNoteOpen] = useState(false)
	const isDismissed = disposition?.disposition === "dismissed"

	return (
		<Card
			id={`finding-${finding.id}`}
			className={isDismissed ? "opacity-60" : ""}
		>
			<CardHeader className="border-b">
				<CardTitle className="flex flex-wrap items-center gap-2 text-sm">
					<Badge
						variant={severityBadgeVariant(finding.severity)}
						className="uppercase"
					>
						{finding.severity}
					</Badge>
					<Badge variant="outline" className="font-mono">
						{finding.detector}
					</Badge>
					<span>{finding.title}</span>
				</CardTitle>
				<CardDescription className="flex items-center gap-2">
					<span className="font-mono text-[11px] text-muted-foreground">
						{finding.id}
					</span>
					{disposition ? (
						<Badge
							variant={
								disposition.disposition === "accepted"
									? "default"
									: disposition.disposition === "dismissed"
										? "ghost"
										: "outline"
							}
							className="uppercase"
						>
							{disposition.disposition}
						</Badge>
					) : null}
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-3">
				<div className="grid gap-3 sm:grid-cols-2">
					<EvidenceBlock finding={finding} />
					<div className="space-y-1 text-xs text-muted-foreground">
						<div className="font-medium text-foreground">Suggested action</div>
						<p className="leading-relaxed">{finding.suggestedAction}</p>
						{commentary ? (
							<>
								<div className="mt-2 font-medium text-foreground">
									Reviewer note (LLM)
								</div>
								<p className="leading-relaxed">{commentary}</p>
							</>
						) : null}
					</div>
				</div>
				{finding.affectedLinePaths.length > 0 ? (
					<div className="flex flex-wrap gap-1 text-[11px]">
						{finding.affectedLinePaths.map((p) => (
							<Badge key={p} variant="outline" className="font-mono">
								{p}
							</Badge>
						))}
					</div>
				) : null}
				{disposition?.note ? (
					<p className="rounded-md bg-muted/50 px-2 py-1 text-xs italic text-muted-foreground">
						Note: {disposition.note}
					</p>
				) : null}
				<div className="flex flex-wrap items-center gap-2">
					<Button
						size="sm"
						variant={
							disposition?.disposition === "accepted" ? "default" : "outline"
						}
						disabled={pending}
						onClick={() => onDisposition("accepted")}
					>
						<CheckIcon /> Accept
					</Button>
					<Button
						size="sm"
						variant={
							disposition?.disposition === "dismissed" ? "default" : "outline"
						}
						disabled={pending}
						onClick={() => onDisposition("dismissed")}
					>
						<TrashIcon /> Dismiss
					</Button>
					<Button
						size="sm"
						variant="outline"
						disabled={pending}
						onClick={() => setNoteOpen((v) => !v)}
					>
						<StickyNoteIcon />
						{disposition?.note ? "Edit note" : "Add note"}
					</Button>
				</div>
				{noteOpen ? (
					<div className="space-y-2">
						<Textarea
							rows={3}
							value={noteDraft}
							placeholder="What did you verify? Which transactions explain this?"
							onChange={(e) => setNoteDraft(e.target.value)}
						/>
						<div className="flex justify-end gap-2">
							<Button
								size="sm"
								variant="ghost"
								onClick={() => {
									setNoteOpen(false)
									setNoteDraft(disposition?.note ?? "")
								}}
							>
								Cancel
							</Button>
							<Button
								size="sm"
								onClick={() => {
									onDisposition("noted", noteDraft.trim() || null)
									setNoteOpen(false)
								}}
							>
								Save note
							</Button>
						</div>
					</div>
				) : null}
			</CardContent>
		</Card>
	)
}

function EvidenceBlock({ finding }: { finding: Finding }) {
	const { evidence } = finding
	return (
		<div className="space-y-1 rounded-md border bg-muted/30 p-3 font-mono text-xs">
			<div className="flex items-center gap-1 font-medium text-foreground">
				<AlertTriangleIcon className="size-3" />
				<span>{evidence.thresholdLabel}</span>
			</div>
			<div className="text-muted-foreground">Rule: {evidence.rule}</div>
			<div className="grid grid-cols-2 gap-x-3 gap-y-0.5 pt-1">
				<span>Current</span>
				<span className="text-right tabular-nums">
					{fmtMoney(evidence.currentValue)}
				</span>
				<span>Baseline</span>
				<span className="text-right tabular-nums">
					{fmtMoney(evidence.baselineValue)}
				</span>
				<span>Δ absolute</span>
				<span className="text-right tabular-nums">
					{fmtMoney(evidence.absDelta)}
				</span>
				<span>Δ percent</span>
				<span className="text-right tabular-nums">
					{fmtPct(evidence.pctDelta)}
				</span>
			</div>
		</div>
	)
}
