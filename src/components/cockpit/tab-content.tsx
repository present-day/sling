import { MessageSquareText, Plus } from "lucide-react"
import type { ReactNode } from "react"
import { Button } from "@/components/ui/button"
import type { TabScope } from "@/lib/cockpit"
import { CockpitActionBar } from "./action-bar"
import { KpiCard } from "./kpi-card"
import { CockpitLayout } from "./zones"

type Kpi = {
	label: string
	amount: number
	delta: { value: number; invert?: boolean }
	trend: number[]
	trendTone: "brand" | "positive" | "negative" | "warning" | "muted"
	attention?: boolean
	footer?: string
}

type ScopePreset = {
	kpis: readonly Kpi[]
	actions: readonly string[]
	recentTitle: string
	chatPrompt: string
}

const trends = {
	up: [12, 14, 13, 15, 17, 16, 18, 19, 21, 22, 24, 27],
	down: [27, 25, 26, 23, 22, 20, 21, 19, 17, 16, 14, 13],
	volatile: [18, 22, 14, 25, 11, 23, 16, 29, 12, 24, 19, 28],
	steady: [20, 21, 19, 22, 21, 20, 22, 21, 22, 20, 21, 22],
}

const presets: Record<TabScope, ScopePreset> = {
	sales: {
		kpis: [
			{
				label: "Revenue · MTD",
				amount: 142800,
				delta: { value: 0.064 },
				trend: trends.up,
				trendTone: "positive",
			},
			{
				label: "A/R outstanding",
				amount: 86420,
				delta: { value: 0.082, invert: true },
				trend: trends.volatile,
				trendTone: "warning",
				attention: true,
				footer: "3 invoices > 90d",
			},
			{
				label: "Avg. days to pay",
				amount: 42,
				delta: { value: 0.11, invert: true },
				trend: trends.up,
				trendTone: "negative",
			},
		],
		actions: ["New invoice", "New customer", "New sales receipt"],
		recentTitle: "Recent invoices",
		chatPrompt: "Ask about a customer, invoice, or A/R trend",
	},
	purchases: {
		kpis: [
			{
				label: "Expenses · MTD",
				amount: 94598.5,
				delta: { value: 0.018, invert: true },
				trend: trends.steady,
				trendTone: "muted",
			},
			{
				label: "A/P outstanding",
				amount: 38120,
				delta: { value: -0.05, invert: true },
				trend: trends.down,
				trendTone: "positive",
			},
			{
				label: "Past-due bills",
				amount: 4280,
				delta: { value: 0.34, invert: true },
				trend: trends.up,
				trendTone: "warning",
				attention: true,
				footer: "2 vendors flagged",
			},
		],
		actions: ["New bill", "New vendor", "Pay bills"],
		recentTitle: "Recent bills",
		chatPrompt: "Ask about a vendor, bill, or expense category",
	},
	banking: {
		kpis: [
			{
				label: "Cash on hand",
				amount: 284532.18,
				delta: { value: -0.031 },
				trend: trends.down,
				trendTone: "negative",
				footer: "across 3 accounts",
			},
			{
				label: "Uncategorized",
				amount: 14,
				delta: { value: 0.4, invert: true },
				trend: trends.up,
				trendTone: "warning",
				attention: true,
				footer: "needs review",
			},
			{
				label: "Last reconciled",
				amount: 12,
				delta: { value: 0, invert: true },
				trend: trends.steady,
				trendTone: "muted",
				footer: "days ago · Operating",
			},
		],
		actions: ["Match transactions", "Add transfer", "Start reconcile"],
		recentTitle: "Recent transactions",
		chatPrompt: "Ask about an account, transfer, or reconciliation",
	},
	books: {
		kpis: [
			{
				label: "Net income · April",
				amount: 48201.5,
				delta: { value: 0.142 },
				trend: trends.up,
				trendTone: "positive",
			},
			{
				label: "Open journal entries",
				amount: 6,
				delta: { value: -0.25 },
				trend: trends.down,
				trendTone: "positive",
			},
			{
				label: "Trial balance Δ",
				amount: 0,
				delta: { value: 0 },
				trend: trends.steady,
				trendTone: "muted",
				footer: "in balance",
			},
		],
		actions: ["New journal entry", "Lock period", "Run trial balance"],
		recentTitle: "Recent journal entries",
		chatPrompt: "Ask about an account, period, or close status",
	},
	reports: {
		kpis: [
			{
				label: "Reports · this month",
				amount: 4,
				delta: { value: 0.33 },
				trend: trends.up,
				trendTone: "brand",
			},
			{
				label: "Variances flagged",
				amount: 7,
				delta: { value: 0.4, invert: true },
				trend: trends.volatile,
				trendTone: "warning",
				attention: true,
				footer: "across 3 categories",
			},
			{
				label: "Last sent to client",
				amount: 5,
				delta: { value: 0, invert: true },
				trend: trends.steady,
				trendTone: "muted",
				footer: "days ago",
			},
		],
		actions: ["Generate month-end", "P&L", "Balance Sheet"],
		recentTitle: "Recently generated",
		chatPrompt: "Ask for a narrative, variance, or comparison",
	},
}

export function CockpitTabContent({
	clientId: _clientId,
	scope,
}: {
	clientId: string
	scope: TabScope
}) {
	const preset = presets[scope]

	return (
		<>
			<CockpitLayout
				kpis={preset.kpis.map((k) => <KpiCard key={k.label} {...k} />)}
				actions={preset.actions.map((label, i) => (
					<Button
						key={label}
						variant={i === 0 ? "default" : "outline"}
						size="sm"
					>
						<Plus />
						{label}
					</Button>
				))}
				content={<RecentPlaceholder title={preset.recentTitle} />}
				chat={<ChatPlaceholder prompt={preset.chatPrompt} />}
			/>
			<CockpitActionBar>
				<Button className="flex-1" size="default">
					<Plus />
					{preset.actions[0]}
				</Button>
				<Button variant="outline" size="icon" aria-label="Open scoped chat">
					<MessageSquareText />
				</Button>
			</CockpitActionBar>
		</>
	)
}

function RecentPlaceholder({ title }: { title: string }) {
	return (
		<Card title={title} hint="Wired in tab-specific issues (#2–#6)">
			<div className="flex flex-col gap-2">
				{[0, 1, 2].map((i) => (
					<div
						key={i}
						className="flex items-center justify-between rounded-md border border-border-subtle bg-surface-sunken/40 px-3 py-2"
					>
						<div className="flex flex-col gap-1">
							<span className="h-3 w-32 rounded bg-ink-muted/15" />
							<span className="h-2.5 w-20 rounded bg-ink-muted/10" />
						</div>
						<span className="h-3 w-16 rounded bg-ink-muted/15" />
					</div>
				))}
			</div>
		</Card>
	)
}

function ChatPlaceholder({ prompt }: { prompt: string }) {
	return (
		<div className="flex h-full flex-col rounded-xl border border-border-subtle bg-surface-raised">
			<div className="border-b border-border-subtle px-4 py-3">
				<p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
					Scoped chat
				</p>
				<p className="text-sm text-ink-secondary">{prompt}</p>
			</div>
			<div className="flex flex-1 items-end p-4">
				<div className="w-full rounded-lg border border-border-subtle bg-surface-base px-3 py-2 text-sm text-ink-muted">
					Wired in #13 / #14
				</div>
			</div>
		</div>
	)
}

function Card({
	title,
	hint,
	children,
}: {
	title: string
	hint?: string
	children: ReactNode
}) {
	return (
		<div className="flex flex-col gap-3 rounded-xl border border-border-subtle bg-surface-raised p-4">
			<div className="flex items-baseline justify-between gap-2">
				<h2 className="text-sm font-semibold text-ink-primary">{title}</h2>
				{hint ? (
					<span className="text-[11px] text-ink-muted">{hint}</span>
				) : null}
			</div>
			{children}
		</div>
	)
}
