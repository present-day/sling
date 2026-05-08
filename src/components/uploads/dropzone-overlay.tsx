"use client"

import { UploadCloudIcon } from "lucide-react"

export function DropZoneOverlay({ visible }: { visible: boolean }) {
	if (!visible) return null
	return (
		<div
			aria-hidden="true"
			className="pointer-events-none fixed inset-2 z-[60] flex items-center justify-center rounded-2xl border-2 border-dashed border-brand bg-brand/5 backdrop-blur-[1px] transition-opacity duration-100"
		>
			<div className="flex flex-col items-center gap-2 rounded-xl bg-surface-raised/95 px-6 py-5 shadow-lg ring-1 ring-border-strong">
				<UploadCloudIcon className="size-7 text-brand" />
				<p className="font-heading text-base font-medium text-ink-primary">
					Drop to file with QuickBooks
				</p>
				<p className="text-xs text-ink-muted">
					PDF, image, CSV, or XLSX — Sling will classify it.
				</p>
			</div>
		</div>
	)
}
