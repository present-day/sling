import { cn } from "@/lib/utils"

type SparklineProps = {
	values: number[]
	tone?: "brand" | "positive" | "negative" | "warning" | "muted"
	width?: number
	height?: number
	pulse?: boolean
	className?: string
}

const toneStroke = {
	brand: "stroke-brand",
	positive: "stroke-positive",
	negative: "stroke-negative",
	warning: "stroke-warning",
	muted: "stroke-ink-muted",
} as const

const toneFill = {
	brand: "fill-brand/10",
	positive: "fill-positive/10",
	negative: "fill-negative/10",
	warning: "fill-warning/10",
	muted: "fill-ink-muted/10",
} as const

export function Sparkline({
	values,
	tone = "brand",
	width = 96,
	height = 24,
	pulse = false,
	className,
}: SparklineProps) {
	if (values.length < 2) {
		return (
			<svg
				viewBox={`0 0 ${width} ${height}`}
				width={width}
				height={height}
				role="presentation"
				className={cn("opacity-40", className)}
			>
				<title>Trend (no data)</title>
				<line
					x1={0}
					y1={height / 2}
					x2={width}
					y2={height / 2}
					strokeWidth={1}
					strokeDasharray="2 3"
					className={toneStroke[tone]}
				/>
			</svg>
		)
	}

	const min = Math.min(...values)
	const max = Math.max(...values)
	const range = max - min || 1
	const stepX = width / (values.length - 1)
	const padY = 2

	const points = values.map((v, i) => {
		const x = i * stepX
		const y = padY + (1 - (v - min) / range) * (height - padY * 2)
		return [x, y] as const
	})

	const path = points
		.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`)
		.join(" ")
	const areaPath = `${path} L${width},${height} L0,${height} Z`

	return (
		<svg
			viewBox={`0 0 ${width} ${height}`}
			width={width}
			height={height}
			role="presentation"
			className={cn(
				"overflow-visible",
				pulse && "animate-in fade-in zoom-in-95 duration-700",
				className,
			)}
		>
			<title>Trend sparkline</title>
			<path d={areaPath} className={toneFill[tone]} strokeWidth={0} />
			<path
				d={path}
				fill="none"
				strokeWidth={1.5}
				strokeLinecap="round"
				strokeLinejoin="round"
				className={toneStroke[tone]}
			/>
		</svg>
	)
}
