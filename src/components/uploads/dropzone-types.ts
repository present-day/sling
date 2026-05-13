import type { inferRouterOutputs } from "@trpc/server"
import type { AppRouter } from "@/server/trpc/root"

type ClassifyOutput = inferRouterOutputs<AppRouter>["uploads"]["classify"]

export type Classification = ClassifyOutput["classification"]
export type Candidate = Classification["candidates"][number]
export type ExtractedFields = Candidate["extractedFields"]

export type DropZoneState =
	| { status: "idle" }
	| { status: "dragging" }
	| { status: "classifying"; fileName: string }
	| {
			status: "choosing"
			uploadId: string
			classification: Classification
			fileName: string
	  }
	| {
			status: "committing"
			uploadId: string
			entityKind: string
			fileName: string
	  }
	| {
			status: "chosen"
			uploadId: string
			entityKind: string
			fileName: string
			outcome: ChosenOutcome
	  }
	| { status: "error"; message: string }

export type ChosenOutcome =
	| {
			kind: "posted"
			createdEntityId: string
			qboAttachableId: string | null
			entityHref: string
			warning: string | null
	  }
	| { kind: "drafted_pending_review"; missing: readonly string[] }
	| { kind: "recorded_no_post"; reason: "kind_not_translatable" }

export type DropZoneContextValue = {
	state: DropZoneState
	openWithFile: (file: File) => void
	choose: (entityKind: string) => void
	dismiss: () => void
	disabled: boolean
}
