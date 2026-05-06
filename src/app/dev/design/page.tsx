import { Delta } from "@/components/cockpit/delta"
import { KpiCard } from "@/components/cockpit/kpi-card"
import { Money } from "@/components/cockpit/money"
import { Sparkline } from "@/components/cockpit/sparkline"
import { ThemeToggle } from "@/components/cockpit/theme-toggle"
import { Button } from "@/components/ui/button"

const tokens = [
	{ name: "surface-base", swatch: "bg-surface-base border-border-subtle" },
	{ name: "surface-raised", swatch: "bg-surface-raised border-border-subtle" },
	{ name: "surface-sunken", swatch: "bg-surface-sunken border-border-subtle" },
	{ name: "ink-primary", swatch: "bg-ink-primary" },
	{ name: "ink-secondary", swatch: "bg-ink-secondary" },
	{ name: "ink-muted", swatch: "bg-ink-muted" },
	{ name: "brand", swatch: "bg-brand" },
	{ name: "brand-subtle", swatch: "bg-brand-subtle" },
	{ name: "positive", swatch: "bg-positive" },
	{ name: "positive-subtle", swatch: "bg-positive-subtle" },
	{ name: "negative", swatch: "bg-negative" },
	{ name: "negative-subtle", swatch: "bg-negative-subtle" },
	{ name: "warning", swatch: "bg-warning" },
	{ name: "warning-subtle", swatch: "bg-warning-subtle" },
	{ name: "border-subtle", swatch: "bg-border-subtle" },
	{ name: "border-strong", swatch: "bg-border-strong" },
] as const

const sampleTrendUp = [12, 14, 13, 15, 17, 16, 18, 19, 21, 22, 24, 27]
const sampleTrendDown = [27, 25, 26, 23, 22, 20, 21, 19, 17, 16, 14, 13]
const sampleTrendVolatile = [18, 22, 14, 25, 11, 23, 16, 29, 12, 24, 19, 28]

export default function DesignPage() {
	return (
		<div className="min-h-screen bg-surface-base text-ink-primary">
			<header className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-border-subtle bg-surface-base/80 px-6 py-3 backdrop-blur">
				<div>
					<h1 className="text-base font-semibold">Sling design system</h1>
					<p className="text-xs text-ink-muted">
						Tokens, primitives, and density review · /dev/design
					</p>
				</div>
				<ThemeToggle />
			</header>

			<div className="mx-auto flex max-w-5xl flex-col gap-12 p-6">
				<Section
					title="Tokens"
					subtitle="OKLCH semantic palette · light + dark are peers"
				>
					<div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
						{tokens.map((t) => (
							<div
								key={t.name}
								className="flex items-center gap-3 rounded-lg border border-border-subtle bg-surface-raised p-2"
							>
								<div
									className={`size-8 shrink-0 rounded-md border ${t.swatch}`}
								/>
								<span className="font-mono text-[11px] text-ink-secondary">
									{t.name}
								</span>
							</div>
						))}
					</div>
				</Section>

				<Section
					title="Typography"
					subtitle="Geist Sans for UI · Geist Mono with tabular figures for amounts"
				>
					<div className="space-y-3 rounded-xl border border-border-subtle bg-surface-raised p-6">
						<p className="text-3xl font-semibold tracking-tight">
							Display 30/36
						</p>
						<p className="text-2xl font-semibold tracking-tight">
							Heading 1 · 24/32
						</p>
						<p className="text-lg font-semibold">Heading 2 · 18/28</p>
						<p className="text-base font-medium">Heading 3 · 16/24</p>
						<p className="text-sm text-ink-secondary">
							Body small · 14/20 · the quick brown fox jumps over 1,234,567.89
						</p>
						<p className="text-xs text-ink-muted">
							Caption · 12/16 · supporting metadata
						</p>
						<p className="font-mono text-base tabular-nums">
							1,234,567.89 · 0.00 · -42,000.00 · mono numerics align in columns
						</p>
					</div>
				</Section>

				<Section
					title="Money"
					subtitle="Tabular figures, sized variants, semantic tones"
				>
					<div className="grid gap-2 rounded-xl border border-border-subtle bg-surface-raised p-6 sm:grid-cols-2">
						<Money amount={1284532.18} size="xl" />
						<Money amount={-4250.0} size="xl" tone="negative" />
						<Money amount={48201.5} size="lg" tone="positive" signed />
						<Money amount={892.4} size="base" />
						<Money amount={-12.99} size="sm" tone="muted" />
						<Money amount={0} size="xs" tone="muted" />
					</div>
				</Section>

				<Section
					title="Delta"
					subtitle="Variance pill · invert flips color for cost-like metrics"
				>
					<div className="flex flex-wrap items-center gap-3 rounded-xl border border-border-subtle bg-surface-raised p-6">
						<Delta value={0.142} />
						<Delta value={-0.082} />
						<Delta value={0} />
						<Delta value={0.21} invert />
						<Delta value={-0.05} invert />
						<Delta value={4250} format="absolute" />
						<Delta value={-1280} format="absolute" />
					</div>
				</Section>

				<Section title="Sparkline" subtitle="SVG-only · pulses on attention">
					<div className="flex flex-wrap items-center gap-6 rounded-xl border border-border-subtle bg-surface-raised p-6">
						<Sparkline values={sampleTrendUp} tone="positive" />
						<Sparkline values={sampleTrendDown} tone="negative" />
						<Sparkline values={sampleTrendVolatile} tone="warning" pulse />
						<Sparkline values={sampleTrendUp} tone="brand" />
						<Sparkline values={[10]} tone="muted" />
					</div>
				</Section>

				<Section
					title="KPI cards"
					subtitle="The cockpit's primary data unit · attention pulses for anomalies"
				>
					<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
						<KpiCard
							label="Net income · April"
							amount={48201.5}
							delta={{ value: 0.142 }}
							trend={sampleTrendUp}
							trendTone="positive"
						/>
						<KpiCard
							label="A/R outstanding"
							amount={86420.0}
							delta={{ value: 0.082, invert: true }}
							trend={sampleTrendVolatile}
							trendTone="warning"
							attention
							footer="3 invoices > 90d"
						/>
						<KpiCard
							label="Cash on hand"
							amount={284532.18}
							delta={{ value: -0.031 }}
							trend={sampleTrendDown}
							trendTone="negative"
							footer="across 3 accounts"
						/>
						<KpiCard
							label="Revenue · April"
							amount={142800}
							delta={{ value: 0.064 }}
							trend={sampleTrendUp}
							trendTone="positive"
						/>
						<KpiCard
							label="Expenses · April"
							amount={94598.5}
							delta={{ value: 0.018, invert: true }}
							trend={sampleTrendVolatile}
							trendTone="muted"
						/>
						<KpiCard
							label="Past-due bills"
							amount={4280}
							delta={{ value: 0.34, invert: true }}
							trend={sampleTrendUp}
							trendTone="warning"
							attention
							footer="2 vendors flagged"
						/>
					</div>
				</Section>

				<Section
					title="Buttons"
					subtitle="Existing shadcn surface · should inherit new tokens cleanly"
				>
					<div className="flex flex-wrap gap-2 rounded-xl border border-border-subtle bg-surface-raised p-6">
						<Button>Primary</Button>
						<Button variant="secondary">Secondary</Button>
						<Button variant="outline">Outline</Button>
						<Button variant="ghost">Ghost</Button>
						<Button variant="destructive">Destructive</Button>
						<Button variant="link">Link</Button>
					</div>
				</Section>
			</div>
		</div>
	)
}

function Section({
	title,
	subtitle,
	children,
}: {
	title: string
	subtitle?: string
	children: React.ReactNode
}) {
	return (
		<section className="flex flex-col gap-4">
			<div>
				<h2 className="text-sm font-semibold uppercase tracking-wide text-ink-secondary">
					{title}
				</h2>
				{subtitle ? (
					<p className="mt-0.5 text-xs text-ink-muted">{subtitle}</p>
				) : null}
			</div>
			{children}
		</section>
	)
}
