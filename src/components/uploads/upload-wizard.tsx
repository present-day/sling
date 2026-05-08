"use client"

import {
	AlertCircleIcon,
	CheckCircle2Icon,
	FileTextIcon,
	Loader2Icon,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import type { Candidate, DropZoneState } from "./dropzone-types"

type WizardOpen = Exclude<DropZoneState["status"], "idle" | "dragging">

const OPEN_STATUSES: readonly WizardOpen[] = [
	"classifying",
	"choosing",
	"committing",
	"chosen",
	"error",
] as const

function isOpenStatus(s: DropZoneState["status"]): s is WizardOpen {
	return (OPEN_STATUSES as readonly string[]).includes(s)
}

export function UploadWizard({
	state,
	onChoose,
	onDismiss,
}: {
	state: DropZoneState
	onChoose: (entityKind: string) => void
	onDismiss: () => void
}) {
	const open = isOpenStatus(state.status)
	return (
		<Sheet
			open={open}
			onOpenChange={(next) => {
				if (!next) onDismiss()
			}}
		>
			<SheetContent className="flex flex-col gap-0 sm:max-w-md">
				<SheetHeader className="border-b border-border-subtle">
					<SheetTitle>{titleFor(state)}</SheetTitle>
					<SheetDescription>{descriptionFor(state)}</SheetDescription>
				</SheetHeader>
				<div className="flex-1 overflow-y-auto p-4">
					<WizardBody state={state} onChoose={onChoose} />
				</div>
				<SheetFooter className="border-t border-border-subtle">
					<Button
						variant="outline"
						onClick={onDismiss}
						disabled={state.status === "committing"}
					>
						{state.status === "chosen" ? "Done" : "Cancel"}
					</Button>
				</SheetFooter>
			</SheetContent>
		</Sheet>
	)
}

function titleFor(state: DropZoneState): string {
	switch (state.status) {
		case "classifying":
			return "Classifying…"
		case "choosing":
			return "Confirm what to file"
		case "committing":
			return "Filing…"
		case "chosen":
			return "Filed"
		case "error":
			return "Upload failed"
		default:
			return ""
	}
}

function descriptionFor(state: DropZoneState): string {
	switch (state.status) {
		case "classifying":
			return state.fileName
		case "choosing":
			return `${state.fileName} · pick the QuickBooks entity to file as`
		case "committing":
			return `${state.fileName} · ${state.entityKind}`
		case "chosen":
			return `${state.fileName} · ${state.entityKind}`
		case "error":
			return state.message
		default:
			return ""
	}
}

function WizardBody({
	state,
	onChoose,
}: {
	state: DropZoneState
	onChoose: (entityKind: string) => void
}) {
	if (state.status === "classifying") {
		return (
			<div className="flex flex-col gap-3">
				<div className="flex items-center gap-2 text-sm text-ink-muted">
					<Loader2Icon className="size-4 animate-spin" />
					Reading the document and matching it to a QuickBooks entity.
				</div>
				<Skeleton className="h-20 w-full" />
				<Skeleton className="h-20 w-full" />
				<Skeleton className="h-20 w-full" />
			</div>
		)
	}
	if (state.status === "choosing") {
		return (
			<div className="flex flex-col gap-3">
				{state.classification.candidates.map((c, i) => (
					<CandidateCard
						key={c.entityKind}
						candidate={c}
						isTop={i === 0}
						onChoose={() => onChoose(c.entityKind)}
					/>
				))}
				{state.classification.notes ? (
					<p className="rounded-md border border-border-subtle bg-surface-sunken/40 p-3 text-xs text-ink-muted">
						{state.classification.notes}
					</p>
				) : null}
			</div>
		)
	}
	if (state.status === "committing") {
		return (
			<div className="flex flex-col gap-3">
				<div className="flex items-center gap-2 text-sm text-ink-muted">
					<Loader2Icon className="size-4 animate-spin" />
					Recording {state.entityKind} for {state.fileName}…
				</div>
			</div>
		)
	}
	if (state.status === "chosen") {
		return (
			<div className="flex flex-col gap-3">
				<div className="flex items-start gap-3 rounded-md border border-positive/40 bg-positive/5 p-3">
					<CheckCircle2Icon className="mt-0.5 size-5 text-positive" />
					<div className="flex flex-col gap-1 text-sm">
						<p className="font-medium text-ink-primary">
							{state.entityKind} chosen for {state.fileName}.
						</p>
						<p className="text-ink-muted">
							The upload has been recorded and tagged. Full entity creation in
							QuickBooks lands with the Sales and Purchases / Banking
							translators.
						</p>
					</div>
				</div>
			</div>
		)
	}
	if (state.status === "error") {
		return (
			<div className="flex items-start gap-3 rounded-md border border-negative/40 bg-negative/5 p-3">
				<AlertCircleIcon className="mt-0.5 size-5 text-negative" />
				<p className="text-sm text-ink-primary">{state.message}</p>
			</div>
		)
	}
	return null
}

function CandidateCard({
	candidate,
	isTop,
	onChoose,
}: {
	candidate: Candidate
	isTop: boolean
	onChoose: () => void
}) {
	const fields = readableFields(candidate)
	return (
		<button
			type="button"
			onClick={onChoose}
			className={cn(
				"flex flex-col gap-2 rounded-lg border p-3 text-left transition-colors hover:bg-surface-sunken/60",
				isTop
					? "border-brand/60 bg-brand/5"
					: "border-border-subtle bg-surface-raised",
			)}
		>
			<div className="flex items-center justify-between gap-2">
				<div className="flex items-center gap-2">
					<FileTextIcon className="size-4 text-ink-muted" />
					<span className="font-heading text-sm font-medium text-ink-primary">
						{candidate.entityKind}
					</span>
					{isTop ? <Badge variant="secondary">best match</Badge> : null}
				</div>
				<span className="font-mono text-xs tabular-nums text-ink-muted">
					{(candidate.confidence * 100).toFixed(0)}%
				</span>
			</div>
			<p className="text-xs text-ink-secondary">{candidate.reasoning}</p>
			{fields.length > 0 ? (
				<dl className="grid grid-cols-2 gap-x-3 gap-y-1 pt-1 text-xs">
					{fields.map(([k, v]) => (
						<div
							key={k}
							className="flex items-baseline justify-between gap-2 truncate"
						>
							<dt className="text-ink-muted">{k}</dt>
							<dd className="truncate font-mono tabular-nums text-ink-primary">
								{v}
							</dd>
						</div>
					))}
				</dl>
			) : null}
		</button>
	)
}

function readableFields(candidate: Candidate): Array<[string, string]> {
	const f = candidate.extractedFields
	const out: Array<[string, string]> = []
	if (f.totalAmount !== undefined)
		out.push(["total", formatAmount(f.totalAmount, f.currency)])
	if (f.txnDate) out.push(["date", f.txnDate])
	if (f.docNumber) out.push(["doc #", f.docNumber])
	if (f.vendorName) out.push(["vendor", f.vendorName])
	if (f.customerName) out.push(["customer", f.customerName])
	if (f.dueDate) out.push(["due", f.dueDate])
	return out.slice(0, 4)
}

function formatAmount(amount: number, currency?: string): string {
	const cur = currency ?? "USD"
	try {
		return new Intl.NumberFormat("en-US", {
			style: "currency",
			currency: cur,
		}).format(amount)
	} catch {
		return `${amount.toFixed(2)} ${cur}`
	}
}
