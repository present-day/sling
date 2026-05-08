import { buttonVariants } from "@/components/ui/button"

export default async function AdminNewClientPage({
	searchParams,
}: {
	searchParams: Promise<{ error?: string }>
}) {
	const sp = await searchParams
	return (
		<div className="mx-auto max-w-lg space-y-4">
			<h1 className="font-heading text-2xl font-semibold">
				Connect QuickBooks
			</h1>
			<p className="text-muted-foreground text-sm">
				OAuth uses your Intuit app credentials from{" "}
				<code className="font-mono text-xs">.env</code>. You will return with a
				stored refresh token per realm.
			</p>
			{sp.error ? (
				<p className="text-destructive text-sm">
					{decodeURIComponent(sp.error)}
				</p>
			) : null}
			<a className={buttonVariants()} href="/api/qbo/oauth/authorize">
				Connect with Intuit
			</a>
		</div>
	)
}
