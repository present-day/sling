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
	  }
	| { status: "error"; message: string }

export type DropZoneContextValue = {
	state: DropZoneState
	openWithFile: (file: File) => void
	choose: (entityKind: string) => void
	dismiss: () => void
	disabled: boolean
}
