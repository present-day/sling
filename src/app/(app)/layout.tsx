import { AppShell } from "@/components/layout/app-shell"
import { DropZoneProvider } from "@/components/uploads/dropzone-provider"
import { requireSessionWithOrg } from "@/lib/auth-server"

export default async function AppSegmentLayout({
	children,
}: {
	children: React.ReactNode
}) {
	await requireSessionWithOrg()
	return (
		<AppShell>
			<DropZoneProvider>{children}</DropZoneProvider>
		</AppShell>
	)
}
