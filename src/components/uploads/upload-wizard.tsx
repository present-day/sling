"use client"

import {
	AlertCircleIcon,
	CheckCircle2Icon,
	ExternalLinkIcon,
	FileTextIcon,
	Loader2Icon,
	PlusCircleIcon,
} from "lucide-react"
import { useState } from "react"
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
import type {
	Candidate,
	ChosenOutcome,
	DropZoneState,
	ResolutionDecision,
	ResolutionPrompt,
} from "./dropzone-types"

type WizardOpen = Exclude<DropZoneState["status"], "idle" | "dragging">

const OPEN_STATUSES: readonly WizardOpen[] = [
	"classifying",
	"choosing",
	"committing",
	"resolving_refs",
	"chosen",
	"error",
] as const

function isOpenStatus(s: DropZoneState["status"]): s is WizardOpen {
	return (OPEN_STATUSES as readonly string[]).includes(s)
}

export function UploadWizard({
	state,
	onChoose,
	onSubmitResolutions,
	onDismiss,
}: {
	state: DropZoneState
	onChoose: (entityKind: string) => void
	onSubmitResolutions: (decisions: ResolutionDecision[]) => void
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
					<WizardBody
						state={state}
						onChoose={onChoose}
						onSubmitResolutions={onSubmitResolutions}
					/>
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
		case "resolving_refs":
			return "Match to QuickBooks"
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
		case "resolving_refs":
			return `${state.fileName} · pick or create the linked records`
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
	onSubmitResolutions,
}: {
	state: DropZoneState
	onChoose: (entityKind: string) => void
	onSubmitResolutions: (decisions: ResolutionDecision[]) => void
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
	if (state.status === "resolving_refs") {
		return (
			<ResolveRefsBody prompts={state.prompts} onSubmit={onSubmitResolutions} />
		)
	}
	if (state.status === "chosen") {
		return (
			<ChosenBody
				entityKind={state.entityKind}
				fileName={state.fileName}
				outcome={state.outcome}
			/>
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

function ResolveRefsBody({
	prompts,
	onSubmit,
}: {
	prompts: readonly ResolutionPrompt[]
	onSubmit: (decisions: ResolutionDecision[]) => void
}) {
	// Map from role -> chosen ResolutionChoice (or undefined while pending).
	const [picks, setPicks] = useState<
		Record<string, ResolutionDecision["choice"] | undefined>
	>({})
	const allPicked = prompts.every((p) => picks[p.role] !== undefined)

	const choose = (role: string, choice: ResolutionDecision["choice"]) => {
		setPicks((prev) => ({ ...prev, [role]: choice }))
	}

	const fire = () => {
		const decisions: ResolutionDecision[] = []
		for (const p of prompts) {
			const choice = picks[p.role]
			if (!choice) return
			decisions.push({ role: p.role, choice })
		}
		onSubmit(decisions)
	}

	return (
		<div className="flex flex-col gap-4">
			{prompts.map((p) => (
				<PromptCard
					key={p.role}
					prompt={p}
					pick={picks[p.role]}
					onPickExisting={(value) =>
						choose(p.role, { kind: "existing", value })
					}
					onPickCreate={() =>
						choose(p.role, { kind: "create_new", name: p.name })
					}
				/>
			))}
			<Button onClick={fire} disabled={!allPicked} className="self-end">
				File to QuickBooks
			</Button>
		</div>
	)
}

function PromptCard({
	prompt,
	pick,
	onPickExisting,
	onPickCreate,
}: {
	prompt: ResolutionPrompt
	pick: ResolutionDecision["choice"] | undefined
	onPickExisting: (value: string) => void
	onPickCreate: () => void
}) {
	const label = prompt.role === "CustomerRef" ? "Customer" : "Vendor"
	return (
		<div className="flex flex-col gap-2 rounded-md border border-border-subtle bg-surface-raised p-3">
			<div className="flex items-baseline justify-between gap-2">
				<span className="text-xs uppercase tracking-wide text-ink-muted">
					{label}
				</span>
				<span className="font-mono text-sm text-ink-primary">
					{prompt.name}
				</span>
			</div>
			{prompt.matches.length > 0 ? (
				<>
					<p className="text-xs text-ink-muted">
						{prompt.matches.length === 1
							? "1 match in QuickBooks. Confirm or create a new record."
							: `${prompt.matches.length} possible matches in QuickBooks.`}
					</p>
					<ul className="flex flex-col gap-1">
						{prompt.matches.map((m) => {
							const selected = pick?.kind === "existing" && pick.value === m.id
							return (
								<li key={m.id}>
									<button
										type="button"
										onClick={() => onPickExisting(m.id)}
										className={cn(
											"flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors",
											selected
												? "border-brand/60 bg-brand/10 text-ink-primary"
												: "border-border-subtle bg-surface-base hover:bg-surface-sunken/60",
										)}
									>
										<span>{m.displayName}</span>
										<span className="font-mono text-xs text-ink-muted">
											id {m.id}
										</span>
									</button>
								</li>
							)
						})}
					</ul>
				</>
			) : (
				<p className="text-xs text-ink-muted">
					No matches found in QuickBooks for &ldquo;{prompt.name}&rdquo;.
				</p>
			)}
			<button
				type="button"
				onClick={onPickCreate}
				className={cn(
					"flex items-center gap-2 self-start rounded-md border px-3 py-1.5 text-sm transition-colors",
					pick?.kind === "create_new"
						? "border-brand/60 bg-brand/10 text-ink-primary"
						: "border-border-subtle bg-surface-raised hover:bg-surface-sunken/60",
				)}
			>
				<PlusCircleIcon className="size-4" />
				Create new &ldquo;{prompt.name}&rdquo;
			</button>
		</div>
	)
}

function ChosenBody({
	entityKind,
	fileName,
	outcome,
}: {
	entityKind: string
	fileName: string
	outcome: ChosenOutcome
}) {
	if (outcome.kind === "posted") {
		const accent = outcome.warning
			? "border-warning/40 bg-warning/5"
			: "border-positive/40 bg-positive/5"
		const iconClass = outcome.warning ? "text-warning" : "text-positive"
		return (
			<div className="flex flex-col gap-3">
				<div
					className={cn("flex items-start gap-3 rounded-md border p-3", accent)}
				>
					<CheckCircle2Icon className={cn("mt-0.5 size-5", iconClass)} />
					<div className="flex flex-col gap-1 text-sm">
						<p className="font-medium text-ink-primary">
							{entityKind} posted to QuickBooks.
						</p>
						<dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 pt-1 text-xs">
							<dt className="text-ink-muted">file</dt>
							<dd className="truncate font-mono tabular-nums text-ink-primary">
								{fileName}
							</dd>
							<dt className="text-ink-muted">entity id</dt>
							<dd className="font-mono tabular-nums text-ink-primary">
								{outcome.createdEntityId}
							</dd>
							{outcome.qboAttachableId ? (
								<>
									<dt className="text-ink-muted">attachable id</dt>
									<dd className="font-mono tabular-nums text-ink-primary">
										{outcome.qboAttachableId}
									</dd>
								</>
							) : null}
						</dl>
						{outcome.warning ? (
							<p className="text-xs text-ink-muted">{outcome.warning}</p>
						) : null}
					</div>
				</div>
				<a
					href={outcome.entityHref}
					target="_blank"
					rel="noopener noreferrer"
					className="inline-flex items-center gap-1.5 self-start rounded-md border border-border-subtle bg-surface-raised px-3 py-1.5 text-sm font-medium text-ink-primary transition-colors hover:bg-surface-sunken/60"
				>
					<ExternalLinkIcon className="size-4" />
					View in QuickBooks
				</a>
			</div>
		)
	}
	if (outcome.kind === "drafted_pending_review") {
		return (
			<div className="flex flex-col gap-3">
				<div className="flex items-start gap-3 rounded-md border border-warning/40 bg-warning/5 p-3">
					<AlertCircleIcon className="mt-0.5 size-5 text-warning" />
					<div className="flex flex-col gap-1 text-sm">
						<p className="font-medium text-ink-primary">
							{entityKind} drafted, but needs review.
						</p>
						<p className="text-ink-muted">
							{fileName} is recorded. To post it to QuickBooks we still need:{" "}
							<span className="font-mono">{outcome.missing.join(", ")}</span>.
							The wizard form in issue #10 will collect these fields.
						</p>
					</div>
				</div>
			</div>
		)
	}
	return (
		<div className="flex flex-col gap-3">
			<div className="flex items-start gap-3 rounded-md border border-border-subtle bg-surface-sunken/40 p-3">
				<FileTextIcon className="mt-0.5 size-5 text-ink-muted" />
				<div className="flex flex-col gap-1 text-sm">
					<p className="font-medium text-ink-primary">
						{entityKind} recorded for {fileName}.
					</p>
					<p className="text-ink-muted">
						QuickBooks posting for {entityKind} ships with the Purchases /
						Banking translators (issue #12).
					</p>
				</div>
			</div>
		</div>
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
