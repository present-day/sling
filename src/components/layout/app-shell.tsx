import { AppSidebar } from "./app-sidebar";

export function AppShell({
	children,
	productName,
}: {
	children: React.ReactNode;
	productName?: string;
}) {
	return (
		<div className="flex min-h-screen">
			<AppSidebar productName={productName} />
			<div className="flex min-h-screen flex-1 flex-col">
				<main className="flex-1 p-6">{children}</main>
			</div>
		</div>
	);
}
