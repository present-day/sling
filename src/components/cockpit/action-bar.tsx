import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

/**
 * Mobile-only sticky bottom action bar. On md+ the cockpit's quick-action row
 * (zones.tsx) handles primary actions; on mobile this renders thumb-reachable
 * above the iOS home indicator.
 */
export function CockpitActionBar({
	children,
	className,
}: {
	children: ReactNode
	className?: string
}) {
	return (
		<div
			className={cn(
				"sticky bottom-0 z-10 -mx-4 mt-4 border-t border-border-subtle bg-surface-base/90 px-4 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2 backdrop-blur md:hidden",
				className,
			)}
		>
			<div className="flex items-center gap-2">{children}</div>
		</div>
	)
}
