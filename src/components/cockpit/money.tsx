import { cn } from "@/lib/utils"

type MoneyProps = {
	amount: number
	currency?: string
	locale?: string
	signed?: boolean
	tone?: "default" | "muted" | "positive" | "negative"
	size?: "xs" | "sm" | "base" | "lg" | "xl"
	className?: string
}

const sizeClass = {
	xs: "text-xs",
	sm: "text-sm",
	base: "text-base",
	lg: "text-lg tracking-tight",
	xl: "text-2xl tracking-tight",
} as const

const toneClass = {
	default: "text-ink-primary",
	muted: "text-ink-muted",
	positive: "text-positive",
	negative: "text-negative",
} as const

export function Money({
	amount,
	currency = "USD",
	locale = "en-US",
	signed = false,
	tone = "default",
	size = "base",
	className,
}: MoneyProps) {
	const formatter = new Intl.NumberFormat(locale, {
		style: "currency",
		currency,
		signDisplay: signed ? "exceptZero" : "auto",
	})
	return (
		<span
			className={cn(
				"font-mono tabular-nums",
				sizeClass[size],
				toneClass[tone],
				className,
			)}
		>
			{formatter.format(amount)}
		</span>
	)
}
