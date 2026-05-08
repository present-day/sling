import { notFound } from "next/navigation"
import { CockpitTabContent } from "@/components/cockpit/tab-content"
import { CockpitTabNav } from "@/components/cockpit/tab-nav"
import { isTabScope, TAB_BLURBS, TAB_LABELS } from "@/lib/cockpit"

export default async function CockpitTabPage({
	params,
}: {
	params: Promise<{ clientId: string; scope: string }>
}) {
	const { clientId, scope } = await params
	if (!isTabScope(scope)) notFound()

	return (
		<div className="-m-6 flex min-h-[calc(100vh-1px)] flex-col bg-surface-base text-ink-primary">
			<header className="px-4 pt-4 md:px-6 md:pt-6">
				<h1 className="text-xl font-semibold tracking-tight md:text-2xl">
					{TAB_LABELS[scope]}
				</h1>
				<p className="text-sm text-ink-muted">{TAB_BLURBS[scope]}</p>
			</header>
			<div className="px-4 md:px-6">
				<CockpitTabNav clientId={clientId} active={scope} />
			</div>
			<div className="flex-1 px-4 pt-4 pb-4 md:px-6 md:pt-6">
				<CockpitTabContent clientId={clientId} scope={scope} />
			</div>
		</div>
	)
}
