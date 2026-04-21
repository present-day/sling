"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ScrollArea } from "@/components/ui/scroll-area";
import { adminNav, clientNavGroups, reportNav } from "@/lib/nav";
import { cn } from "@/lib/utils";

export function AppSidebar({
	productName = "Console",
}: {
	productName?: string;
}) {
	const pathname = usePathname();
	const match = pathname?.match(/^\/clients\/([^/]+)/);
	const clientBase = match ? `/clients/${match[1]}` : undefined;

	return (
		<aside className="bg-sidebar text-sidebar-foreground flex h-full w-64 shrink-0 flex-col border-r border-sidebar-border">
			<div className="border-b border-sidebar-border px-4 py-3">
				<Link className="font-heading text-lg font-semibold" href="/dashboard">
					{productName}
				</Link>
				<p className="text-muted-foreground text-xs">ZeroCool</p>
			</div>
			<ScrollArea className="flex-1">
				<nav className="flex flex-col gap-4 p-3 text-sm">
					<div>
						<p className="text-muted-foreground mb-1 px-2 text-xs font-medium uppercase">
							App
						</p>
						<SidebarLink
							href="/dashboard"
							pathname={pathname}
							label="Dashboard"
						/>
						<SidebarLink href="/clients" pathname={pathname} label="Clients" />
					</div>
					<div>
						<p className="text-muted-foreground mb-1 px-2 text-xs font-medium uppercase">
							Admin
						</p>
						{adminNav.map((item) => (
							<SidebarLink
								key={item.href}
								href={item.href}
								pathname={pathname}
								label={item.label}
							/>
						))}
					</div>
					{clientBase ? (
						<>
							{clientNavGroups.map((group) => (
								<div key={group.label}>
									<p className="text-muted-foreground mb-1 px-2 text-xs font-medium uppercase">
										{group.label}
									</p>
									{group.items.map((item) => {
										const href =
											item.href === ""
												? clientBase
												: `${clientBase}/${item.href}`;
										return (
											<SidebarLink
												key={href}
												href={href}
												pathname={pathname}
												label={item.label}
											/>
										);
									})}
								</div>
							))}
							<div>
								<p className="text-muted-foreground mb-1 px-2 text-xs font-medium uppercase">
									Report templates
								</p>
								{reportNav.map((item) => (
									<SidebarLink
										key={item.href}
										href={`${clientBase}/reports/${item.href}`}
										pathname={pathname}
										label={item.label}
									/>
								))}
							</div>
						</>
					) : null}
				</nav>
			</ScrollArea>
		</aside>
	);
}

function SidebarLink({
	href,
	pathname,
	label,
}: {
	href: string;
	pathname: string | null;
	label: string;
}) {
	const active =
		pathname === href || (href !== "/" && pathname?.startsWith(`${href}/`));
	return (
		<Link
			className={cn(
				"block rounded-md px-2 py-1.5 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
				active && "bg-sidebar-accent text-sidebar-accent-foreground",
			)}
			href={href}
		>
			{label}
		</Link>
	);
}
