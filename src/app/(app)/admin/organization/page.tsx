export default function AdminOrganizationPage() {
	return (
		<div className="space-y-2">
			<h1 className="font-heading text-2xl font-semibold">Organization</h1>
			<p className="text-muted-foreground text-sm">
				License, branding (logo, product name, accent), and members — extend via
				tRPC <code className="font-mono text-xs">org.branding</code> and Better
				Auth organization APIs.
			</p>
		</div>
	);
}
