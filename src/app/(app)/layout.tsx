import { AppShell } from "@/components/layout/app-shell";
import { requireSessionWithOrg } from "@/lib/auth-server";

export default async function AppSegmentLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	await requireSessionWithOrg();
	return <AppShell>{children}</AppShell>;
}
