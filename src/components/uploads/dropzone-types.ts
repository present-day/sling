import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server"
import type { AppRouter } from "@/server/trpc/root"

type ClassifyOutput = inferRouterOutputs<AppRouter>["uploads"]["classify"]
type ResolveRefsOutput = inferRouterOutputs<AppRouter>["uploads"]["resolveRefs"]
type CommitInput = inferRouterInputs<AppRouter>["uploads"]["commit"]

export type Classification = ClassifyOutput["classification"]
export type Candidate = Classification["candidates"][number]
export type ExtractedFields = Candidate["extractedFields"]

export type ResolutionPrompt = Extract<
	ResolveRefsOutput,
	{ status: "needs_prompt" }
>["prompts"][number]
export type CommitDraft = CommitInput["commit"]
export type ResolutionDecision = NonNullable<CommitInput["resolutions"]>[number]
export type ResolutionChoice = ResolutionDecision["choice"]

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
			status: "resolving_refs"
			uploadId: string
			entityKind: string
			fileName: string
			draft: CommitDraft
			prompts: readonly ResolutionPrompt[]
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
	submitResolutions: (decisions: ResolutionDecision[]) => void
	dismiss: () => void
	disabled: boolean
}
