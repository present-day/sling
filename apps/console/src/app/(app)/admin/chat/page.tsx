export default function AdminChatPage() {
	return (
		<div className="space-y-2">
			<h1 className="font-heading text-2xl font-semibold">Admin chat</h1>
			<p className="text-muted-foreground text-sm">
				Streaming endpoint:{" "}
				<code className="font-mono text-xs">POST /api/chat/admin</code> — wire
				Anthropic + allow-listed tools per PLAN.md §10.
			</p>
		</div>
	);
}
