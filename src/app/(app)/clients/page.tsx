"use client";

import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { trpc } from "@/trpc/react";

export default function ClientsPage() {
	const { data, isLoading, error } = trpc.clients.list.useQuery();

	return (
		<div className="space-y-6">
			<div className="flex flex-wrap items-center justify-between gap-4">
				<div>
					<h1 className="font-heading text-2xl font-semibold">Clients</h1>
					<p className="text-muted-foreground text-sm">
						QuickBooks companies connected to your organization.
					</p>
				</div>
				<Link className={buttonVariants()} href="/admin/clients/new">
					Add client
				</Link>
			</div>
			{isLoading ? (
				<p className="text-muted-foreground text-sm">Loading…</p>
			) : error ? (
				<p className="text-destructive text-sm">{error.message}</p>
			) : (
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Name</TableHead>
							<TableHead>Realm</TableHead>
							<TableHead>Environment</TableHead>
							<TableHead />
						</TableRow>
					</TableHeader>
					<TableBody>
						{(data ?? []).map((c) => (
							<TableRow key={c.id}>
								<TableCell>{c.name}</TableCell>
								<TableCell className="font-mono text-xs">{c.realmId}</TableCell>
								<TableCell>{c.environment}</TableCell>
								<TableCell>
									<Link
										className={buttonVariants({
											variant: "outline",
											size: "sm",
										})}
										href={`/clients/${c.id}`}
									>
										Open
									</Link>
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			)}
		</div>
	);
}
