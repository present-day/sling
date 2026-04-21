import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function DashboardPage() {
	return (
		<div className="space-y-6">
			<div>
				<h1 className="font-heading text-2xl font-semibold">Dashboard</h1>
				<p className="text-muted-foreground text-sm">
					Connect QuickBooks clients and open a workspace from the sidebar.
				</p>
			</div>
			<div className="grid gap-4 md:grid-cols-2">
				<Card>
					<CardHeader>
						<CardTitle>Clients</CardTitle>
					</CardHeader>
					<CardContent className="text-muted-foreground text-sm">
						Go to <span className="text-foreground">Clients</span> to add a
						sandbox company or use the bootstrap script.
					</CardContent>
				</Card>
				<Card>
					<CardHeader>
						<CardTitle>Admin chat</CardTitle>
					</CardHeader>
					<CardContent className="text-muted-foreground text-sm">
						Cross-client AI tools live under Admin → Admin chat once MCP is
						configured.
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
