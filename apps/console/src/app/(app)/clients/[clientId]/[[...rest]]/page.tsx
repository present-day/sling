"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ProfitLossReport } from "@/components/reports/profit-loss-report";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ENTITY_SEARCH } from "@/lib/entity-search";
import { reportNav } from "@/lib/nav";
import { trpc } from "@/trpc/react";

export default function ClientWorkspacePage() {
	const params = useParams<{ clientId: string; rest?: string[] }>();
	const clientId = params.clientId;
	const rest = params.rest ?? [];
	const segment = rest[0] ?? "overview";
	const sub = rest.slice(1);

	const clientQuery = trpc.clients.get.useQuery({ clientId });
	const entityStem = ENTITY_SEARCH[segment];
	const searchQuery = trpc.qbo.searchProxy.useQuery(
		{
			clientId,
			entity: entityStem ?? "customers",
			query: "",
			limit: 25,
		},
		{ enabled: Boolean(entityStem) },
	);
	const reportsQuery = trpc.reports.list.useQuery(undefined, {
		enabled: segment === "reports" && sub.length === 0,
	});

	if (clientQuery.isLoading) {
		return <p className="text-muted-foreground text-sm">Loading client…</p>;
	}
	if (clientQuery.error || !clientQuery.data) {
		return (
			<p className="text-destructive text-sm">
				{clientQuery.error?.message ?? "Client not found"}
			</p>
		);
	}

	if (segment === "overview") {
		return (
			<div className="space-y-4">
				<div>
					<h1 className="font-heading text-2xl font-semibold">
						{clientQuery.data.name}
					</h1>
					<p className="text-muted-foreground font-mono text-sm">
						Realm {clientQuery.data.realmId} · {clientQuery.data.environment}
					</p>
				</div>
				<Card>
					<CardHeader>
						<CardTitle>Workspace</CardTitle>
					</CardHeader>
					<CardContent className="text-muted-foreground text-sm">
						Use the sidebar for entities, reports, and chat. Entity pages load
						data from QuickBooks via the Accounting API.
					</CardContent>
				</Card>
			</div>
		);
	}

	if (segment === "chat") {
		return (
			<div className="space-y-2">
				<h1 className="font-heading text-2xl font-semibold">Client chat</h1>
				<p className="text-muted-foreground text-sm">
					Streaming chat ships via{" "}
					<code className="font-mono text-xs">/api/chat/client/{clientId}</code>
					.
				</p>
			</div>
		);
	}

	if (segment === "reports" && sub.length === 0) {
		return (
			<div className="space-y-4">
				<h1 className="font-heading text-2xl font-semibold">Reports</h1>
				{reportsQuery.isLoading ? (
					<p className="text-muted-foreground text-sm">Loading…</p>
				) : (
					<div className="flex flex-wrap gap-2">
						{reportNav.map((r) => (
							<Link
								className={buttonVariants({ variant: "outline", size: "sm" })}
								href={`/clients/${clientId}/reports/${r.href}`}
								key={r.href}
							>
								{r.label}
							</Link>
						))}
					</div>
				)}
			</div>
		);
	}

	if (segment === "reports" && sub[0] === "profit-loss") {
		return (
			<div className="space-y-4">
				<h1 className="font-heading text-2xl font-semibold">Reports</h1>
				<ProfitLossReport clientId={clientId} />
			</div>
		);
	}

	if (segment === "reports" && sub[0]) {
		return (
			<div className="space-y-2">
				<h1 className="font-heading text-2xl font-semibold">
					Report: {sub[0]}
				</h1>
				<p className="text-muted-foreground text-sm">
					HTML:{" "}
					<code className="font-mono text-xs">
						/api/reports/{clientId}/{sub[0]}/render
					</code>
					· PDF/XLSX via matching API routes.
				</p>
			</div>
		);
	}

	if (entityStem) {
		return (
			<div className="space-y-4">
				<h1 className="font-heading text-2xl font-semibold capitalize">
					{segment.replace(/-/g, " ")}
				</h1>
				{searchQuery.isLoading ? (
					<p className="text-muted-foreground text-sm">Loading data…</p>
				) : searchQuery.error ? (
					<p className="text-destructive text-sm">
						{searchQuery.error.message}
					</p>
				) : (
					<pre className="bg-muted max-h-[480px] overflow-auto rounded-md p-4 font-mono text-xs">
						{JSON.stringify(searchQuery.data?.rows, null, 2)}
					</pre>
				)}
			</div>
		);
	}

	return (
		<div className="space-y-2">
			<h1 className="font-heading text-2xl font-semibold">{segment}</h1>
			<p className="text-muted-foreground text-sm">
				This section is not mapped to a QuickBooks list view yet.
			</p>
		</div>
	);
}
