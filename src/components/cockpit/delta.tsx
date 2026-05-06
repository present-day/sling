import { ArrowDown, ArrowRight, ArrowUp } from "lucide-react"
import { cn } from "@/lib/utils"

type DeltaProps = {
	value: number
	format?: "percent" | "absolute"
	currency?: string
	locale?: string
	/** When true, an upward move is bad (e.g. expenses, AR aging). Flips color only. */
	invert?: boolean
	size?: "sm" | "base"
	className?: string
}

export function Delta({
	value,
	format = "percent",
	currency = "USD",
	locale = "en-US",
	invert = false,
	size = "base",
	className,
}: DeltaProps) {
	const direction = value > 0 ? "up" : value < 0 ? "down" : "flat"
	const isGood =
		direction === "flat"
			? null
			: invert
				? direction === "down"
				: direction === "up"

	const formatter =
		format === "percent"
			? new Intl.NumberFormat(locale, {
					style: "percent",
					maximumFractionDigits: 1,
					signDisplay: "exceptZero",
				})
			: new Intl.NumberFormat(locale, {
					style: "currency",
					currency,
					signDisplay: "exceptZero",
				})

	const Icon =
		direction === "up" ? ArrowUp : direction === "down" ? ArrowDown : ArrowRight

	return (
		<span
			className={cn(
				"inline-flex items-center gap-0.5 rounded-md font-mono tabular-nums",
				size === "sm" ? "px-1 text-xs" : "px-1.5 text-sm",
				isGood === true && "bg-positive-subtle text-positive",
				isGood === false && "bg-negative-subtle text-negative",
				isGood === null && "bg-muted text-ink-muted",
				className,
			)}
		>
			<Icon className={cn(size === "sm" ? "size-3" : "size-3.5")} aria-hidden />
			{formatter.format(value)}
		</span>
	)
}
