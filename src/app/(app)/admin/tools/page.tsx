import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function AdminToolsPage() {
	return (
		<div className="space-y-4">
			<h1 className="font-heading text-2xl font-semibold">MCP tools (admin)</h1>
			<p className="text-muted-foreground text-sm">
				Open any connected client workspace and use{" "}
				<strong>Tool Explorer</strong> to list all tools from{" "}
				<code className="font-mono text-xs">list_tools</code>, or call{" "}
				<code className="font-mono text-xs">qbo.listTools</code> via tRPC.
			</p>
			<Link className={buttonVariants({ variant: "outline" })} href="/clients">
				Go to clients
			</Link>
		</div>
	);
}
