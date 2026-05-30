"use client"

import { ExternalLinkIcon, FileTextIcon, UploadIcon } from "lucide-react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useRef, useState } from "react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useDropZone } from "@/components/uploads/dropzone-provider"
import { trpc } from "@/trpc/react"

/**
 * QBO sandbox write smoke page. Hosts the controls JB needs to demo end-to-end
 * classify → review → post → verify-in-sandbox on a single screen without a
 * real customer file on disk.
 *
 * Lives at `/clients/[clientId]/dev-smoke` (under `(app)`) so it inherits the
 * `DropZoneProvider` already mounted in the segment layout and the active
 * client id resolved by `useActiveClientId`.
 */
export default function DevSmokePage() {
	const params = useParams<{ clientId: string }>()
	const clientId = params.clientId
	const { openWithFile, state } = useDropZone()
	const clientsList = trpc.clients.list.useQuery()
	const uploads = trpc.uploads.listForClient.useQuery({ clientId, limit: 25 })
	const [busy, setBusy] = useState(false)
	const fileInput = useRef<HTMLInputElement>(null)

	const activeClient = clientsList.data?.find((c) => c.id === clientId)

	const dropFixture = async () => {
		setBusy(true)
		try {
			const res = await fetch("/api/dev/fixtures/vendor-bill", {
				cache: "no-store",
			})
			if (!res.ok) throw new Error(`Fixture fetch failed: ${res.status}`)
			const blob = await res.blob()
			const file = new File([blob], "synthetic-vendor-bill.pdf", {
				type: "application/pdf",
			})
			openWithFile(file)
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Failed to load fixture")
		} finally {
			setBusy(false)
		}
	}

	const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
		const f = e.target.files?.[0]
		if (f) openWithFile(f)
		e.target.value = ""
	}

	// Refetch the writes log whenever the wizard reports a `chosen` state,
	// so the most recent posting bubbles to the top without a manual reload.
	if (state.status === "chosen" && !uploads.isRefetching) {
		void uploads.refetch()
	}

	return (
		<div className="mx-auto flex max-w-4xl flex-col gap-6 p-6">
			<header className="flex flex-col gap-2">
				<div className="flex items-center justify-between gap-3">
					<h1 className="font-heading text-2xl font-semibold text-ink-primary">
						QBO write smoke test
					</h1>
					{activeClient ? (
						<Badge
							variant={
								activeClient.environment === "sandbox"
									? "secondary"
									: "destructive"
							}
						>
							{activeClient.environment}
						</Badge>
					) : null}
				</div>
				<p className="text-sm text-ink-muted">
					Drop a document or click a fixture. The classifier picks an entity,
					you review the field mapping, and we post to QuickBooks. The recent
					writes log below shows what landed.
				</p>
				<ClientPicker currentId={clientId} clients={clientsList.data ?? []} />
			</header>

			<section className="flex flex-col gap-3 rounded-lg border border-border-subtle bg-surface-raised p-4">
				<h2 className="text-sm font-semibold text-ink-primary">
					Trigger an upload
				</h2>
				<div className="flex flex-wrap gap-2">
					<Button onClick={dropFixture} disabled={busy}>
						<FileTextIcon className="size-4" />
						Drop synthetic vendor bill
					</Button>
					<Button variant="outline" onClick={() => fileInput.current?.click()}>
						<UploadIcon className="size-4" />
						Choose a file…
					</Button>
					<input
						ref={fileInput}
						type="file"
						accept="application/pdf,image/*,text/csv,.csv,.xls,.xlsx"
						className="hidden"
						onChange={handleFile}
					/>
				</div>
				<p className="text-xs text-ink-muted">
					Or just drag any PDF / image / CSV onto the window — the global
					dropzone is live on this page.
				</p>
			</section>

			<section className="flex flex-col gap-3">
				<div className="flex items-baseline justify-between">
					<h2 className="text-sm font-semibold text-ink-primary">
						Recent writes
					</h2>
					<button
						type="button"
						onClick={() => uploads.refetch()}
						className="text-xs text-ink-muted hover:text-ink-primary"
					>
						Refresh
					</button>
				</div>
				{uploads.isLoading ? (
					<p className="text-sm text-ink-muted">Loading…</p>
				) : (uploads.data ?? []).length === 0 ? (
					<p className="text-sm text-ink-muted">
						No uploads for this client yet. Drop a fixture to get started.
					</p>
				) : (
					<ul className="flex flex-col gap-2">
						{(uploads.data ?? []).map((row) => (
							<UploadRow
								key={row.id}
								row={row}
								environment={activeClient?.environment ?? "sandbox"}
							/>
						))}
					</ul>
				)}
			</section>
		</div>
	)
}

function ClientPicker({
	currentId,
	clients,
}: {
	currentId: string
	clients: Array<{
		id: string
		name: string
		environment: "sandbox" | "production"
	}>
}) {
	if (clients.length <= 1) return null
	return (
		<nav className="flex flex-wrap items-center gap-2 text-xs">
			<span className="text-ink-muted">Switch client:</span>
			{clients.map((c) => (
				<Link
					key={c.id}
					href={`/clients/${c.id}/dev-smoke`}
					className={
						c.id === currentId
							? "rounded-md border border-brand/60 bg-brand/10 px-2 py-1 font-medium text-ink-primary"
							: "rounded-md border border-border-subtle px-2 py-1 text-ink-muted hover:bg-surface-sunken/60 hover:text-ink-primary"
					}
				>
					{c.name}
					{c.environment === "sandbox" ? "" : " (prod)"}
				</Link>
			))}
		</nav>
	)
}

type UploadDbRow = {
	id: string
	fileName: string
	mime: string
	status: string
	chosenEntityKind: string | null
	createdEntityId: string | null
	qboAttachableId: string | null
	postedAt: Date | string | null
	createdAt: Date | string
	lastError: string | null
}

function UploadRow({
	row,
	environment,
}: {
	row: UploadDbRow
	environment: "sandbox" | "production"
}) {
	const href =
		row.createdEntityId && row.chosenEntityKind
			? hrefFor(environment, row.chosenEntityKind, row.createdEntityId)
			: null
	const statusTone =
		row.status === "created"
			? "text-positive"
			: row.status === "failed"
				? "text-negative"
				: "text-ink-muted"
	return (
		<li className="flex flex-col gap-1 rounded-md border border-border-subtle bg-surface-raised p-3">
			<div className="flex items-baseline justify-between gap-3">
				<span className="truncate font-medium text-ink-primary">
					{row.fileName}
				</span>
				<span className={`text-xs uppercase tracking-wide ${statusTone}`}>
					{row.status}
				</span>
			</div>
			<dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-0.5 text-xs">
				<dt className="text-ink-muted">kind</dt>
				<dd className="font-mono tabular-nums text-ink-primary">
					{row.chosenEntityKind ?? "—"}
				</dd>
				{row.createdEntityId ? (
					<>
						<dt className="text-ink-muted">entity id</dt>
						<dd className="font-mono tabular-nums text-ink-primary">
							{row.createdEntityId}
						</dd>
					</>
				) : null}
				{row.qboAttachableId ? (
					<>
						<dt className="text-ink-muted">attach id</dt>
						<dd className="font-mono tabular-nums text-ink-primary">
							{row.qboAttachableId}
						</dd>
					</>
				) : null}
				{row.lastError ? (
					<>
						<dt className="text-ink-muted">error</dt>
						<dd className="font-mono text-negative">{row.lastError}</dd>
					</>
				) : null}
			</dl>
			{href ? (
				<a
					href={href}
					target="_blank"
					rel="noopener noreferrer"
					className="inline-flex items-center gap-1.5 self-start text-xs font-medium text-brand hover:underline"
				>
					<ExternalLinkIcon className="size-3.5" />
					View in QuickBooks
				</a>
			) : null}
		</li>
	)
}

const QBO_HOST = {
	sandbox: "https://app.sandbox.qbo.intuit.com",
	production: "https://app.qbo.intuit.com",
} as const

const PATH_BY_KIND: Record<
	string,
	{ path: string; idKey: string } | undefined
> = {
	// QBO's router is case-sensitive: transactions use lowercase `txnid`
	// (camelCase txnId is ignored and opens a blank new form). Keep in sync
	// with ENTITY_HREF_PATH in server/uploads/commit.ts.
	Bill: { path: "bill", idKey: "txnid" },
	Invoice: { path: "invoice", idKey: "txnid" },
	SalesReceipt: { path: "salesreceipt", idKey: "txnid" },
	Customer: { path: "customerdetail", idKey: "nameId" },
	Vendor: { path: "vendordetail", idKey: "nameId" },
}

function hrefFor(
	env: "sandbox" | "production",
	kind: string,
	id: string,
): string | null {
	const spec = PATH_BY_KIND[kind]
	if (!spec) return null
	return `${QBO_HOST[env]}/app/${spec.path}?${spec.idKey}=${encodeURIComponent(id)}`
}
