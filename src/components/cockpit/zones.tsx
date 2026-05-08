import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

/**
 * The 4-zone cockpit composition every tab shares.
 *
 * Mobile (<lg): zones stack vertically. KPIs sticky to top, action bar sticky
 * to bottom. Chat is a separate <Sheet> trigger, not part of this layout.
 *
 * Desktop (lg+): kpis + actions + content fill the main column; chat docks
 * to the right column when the consumer renders it.
 */
export function CockpitLayout({
	kpis,
	actions,
	content,
	chat,
	className,
}: {
	kpis: ReactNode
	actions?: ReactNode
	content: ReactNode
	chat?: ReactNode
	className?: string
}) {
	return (
		<div
			className={cn(
				"flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-6",
				className,
			)}
		>
			<div className="flex flex-col gap-4">
				<KpiZone>{kpis}</KpiZone>
				{actions ? <ActionZone>{actions}</ActionZone> : null}
				<ContentZone>{content}</ContentZone>
			</div>
			{chat ? <ChatZone>{chat}</ChatZone> : null}
		</div>
	)
}

function KpiZone({ children }: { children: ReactNode }) {
	return (
		<section
			aria-label="KPIs"
			className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0"
		>
			<div className="grid auto-cols-[minmax(220px,1fr)] grid-flow-col gap-3 md:auto-cols-auto md:grid-cols-2 md:grid-flow-row lg:grid-cols-3">
				{children}
			</div>
		</section>
	)
}

function ActionZone({ children }: { children: ReactNode }) {
	return (
		<section
			aria-label="Quick actions"
			className="hidden md:flex md:flex-wrap md:gap-2"
		>
			{children}
		</section>
	)
}

function ContentZone({ children }: { children: ReactNode }) {
	return <section aria-label="Primary content">{children}</section>
}

function ChatZone({ children }: { children: ReactNode }) {
	return (
		<aside
			aria-label="Scoped chat"
			className="hidden lg:block lg:sticky lg:top-16 lg:h-[calc(100vh-7rem)]"
		>
			{children}
		</aside>
	)
}
