import { notFound } from "next/navigation"
import { CockpitTabContent } from "@/components/cockpit/tab-content"
import { CockpitTabNav } from "@/components/cockpit/tab-nav"
import { ThemeToggle } from "@/components/cockpit/theme-toggle"
import { isTabScope, TAB_BLURBS, TAB_LABELS } from "@/lib/cockpit"

const DEV_CLIENT_ID = "dev"

export default async function DevCockpitPage({
	params,
}: {
	params: Promise<{ scope: string }>
}) {
	const { scope } = await params
	if (!isTabScope(scope)) notFound()

	return (
		<div className="min-h-screen bg-surface-base text-ink-primary">
			<header className="flex items-center justify-between gap-4 px-4 pt-4 md:px-6 md:pt-6">
				<div>
					<h1 className="text-xl font-semibold tracking-tight md:text-2xl">
						{TAB_LABELS[scope]}
					</h1>
					<p className="text-sm text-ink-muted">
						{TAB_BLURBS[scope]} · /dev preview · stub data
					</p>
				</div>
				<ThemeToggle />
			</header>
			<div className="px-4 md:px-6">
				<CockpitTabNav
					clientId={DEV_CLIENT_ID}
					active={scope}
					basePath="/dev/cockpit"
				/>
			</div>
			<div className="px-4 pt-4 pb-4 md:px-6 md:pt-6">
				<CockpitTabContent clientId={DEV_CLIENT_ID} scope={scope} />
			</div>
		</div>
	)
}
