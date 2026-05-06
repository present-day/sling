import type { ReactNode } from "react"
import { cn } from "@/lib/utils"
import { Delta } from "./delta"
import { Money } from "./money"
import { Sparkline } from "./sparkline"

type KpiCardProps = {
	label: string
	amount: number
	currency?: string
	delta?: { value: number; format?: "percent" | "absolute"; invert?: boolean }
	trend?: number[]
	trendTone?: "brand" | "positive" | "negative" | "warning" | "muted"
	attention?: boolean
	footer?: ReactNode
	className?: string
}

export function KpiCard({
	label,
	amount,
	currency = "USD",
	delta,
	trend,
	trendTone = "brand",
	attention = false,
	footer,
	className,
}: KpiCardProps) {
	return (
		<div
			className={cn(
				"relative flex flex-col gap-2 rounded-xl border bg-surface-raised p-4 transition-colors",
				attention
					? "border-warning/40 ring-1 ring-warning/20"
					: "border-border-subtle",
				className,
			)}
		>
			<div className="flex items-start justify-between gap-2">
				<span className="text-xs font-medium text-ink-muted uppercase tracking-wide">
					{label}
				</span>
				{attention ? (
					<span
						role="img"
						aria-label="Needs attention"
						className="size-1.5 rounded-full bg-warning animate-pulse"
					/>
				) : null}
			</div>
			<div className="flex items-end justify-between gap-3">
				<Money amount={amount} currency={currency} size="xl" />
				{trend ? (
					<Sparkline
						values={trend}
						tone={attention ? "warning" : trendTone}
						pulse={attention}
						width={72}
						height={28}
						className="shrink-0"
					/>
				) : null}
			</div>
			{(delta || footer) && (
				<div className="flex items-center justify-between gap-2 text-xs text-ink-secondary">
					{delta ? (
						<Delta
							value={delta.value}
							format={delta.format}
							invert={delta.invert}
							size="sm"
						/>
					) : (
						<span />
					)}
					{footer ? <span className="truncate">{footer}</span> : null}
				</div>
			)}
		</div>
	)
}
