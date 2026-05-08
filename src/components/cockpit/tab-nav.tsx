"use client"

import Link from "next/link"
import {
	cockpitHref,
	TAB_LABELS,
	TAB_ORDER,
	type TabScope,
} from "@/lib/cockpit"
import { cn } from "@/lib/utils"

export function CockpitTabNav({
	clientId,
	active,
	basePath,
}: {
	clientId: string
	active: TabScope
	/** Override the link target. Defaults to `/clients/{clientId}/cockpit`. */
	basePath?: string
}) {
	const buildHref = (scope: TabScope) =>
		basePath ? `${basePath}/${scope}` : cockpitHref(clientId, scope)
	return (
		<nav
			aria-label="Cockpit tabs"
			className="sticky top-0 z-20 -mx-4 border-b border-border-subtle bg-surface-base/85 px-4 backdrop-blur md:mx-0 md:px-0"
		>
			<div className="-mb-px flex gap-1 overflow-x-auto scrollbar-none">
				{TAB_ORDER.map((scope) => {
					const isActive = scope === active
					return (
						<Link
							key={scope}
							href={buildHref(scope)}
							aria-current={isActive ? "page" : undefined}
							className={cn(
								"relative flex shrink-0 items-center px-3 py-3 text-sm font-medium transition-colors",
								"min-h-[44px]",
								isActive
									? "text-ink-primary"
									: "text-ink-muted hover:text-ink-secondary",
							)}
						>
							{TAB_LABELS[scope]}
							<span
								aria-hidden="true"
								className={cn(
									"absolute inset-x-3 bottom-0 h-0.5 rounded-t-full transition-colors",
									isActive ? "bg-brand" : "bg-transparent",
								)}
							/>
						</Link>
					)
				})}
			</div>
		</nav>
	)
}
