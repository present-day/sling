"use client"

import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useRef,
	useState,
} from "react"
import { toast } from "sonner"
import { useActiveClientId } from "@/lib/active-client"
import { trpc } from "@/trpc/react"
import { DropZoneOverlay } from "./dropzone-overlay"
import type {
	ChosenOutcome,
	CommitDraft,
	DropZoneContextValue,
	DropZoneState,
	ResolutionDecision,
} from "./dropzone-types"
import { isSupportedClientMime, MAX_UPLOAD_BYTES } from "./supported-mime"
import { UploadWizard } from "./upload-wizard"

type ChooseMutation = ReturnType<typeof trpc.uploads.chooseEntity.useMutation>
type CommitMutation = ReturnType<typeof trpc.uploads.commit.useMutation>
type ResolveRefsMutation = ReturnType<
	typeof trpc.uploads.resolveRefs.useMutation
>

const DropZoneContext = createContext<DropZoneContextValue | null>(null)

export function useDropZone(): DropZoneContextValue {
	const ctx = useContext(DropZoneContext)
	if (!ctx)
		throw new Error("useDropZone must be used inside <DropZoneProvider>")
	return ctx
}

export function DropZoneProvider({ children }: { children: ReactNode }) {
	const clientId = useActiveClientId()
	const disabled = clientId === null

	const [state, setState] = useState<DropZoneState>({ status: "idle" })
	const dragCounter = useRef(0)

	const classifyMutation = trpc.uploads.classify.useMutation()
	const chooseMutation = trpc.uploads.chooseEntity.useMutation()
	const resolveRefsMutation = trpc.uploads.resolveRefs.useMutation()
	const commitMutation = trpc.uploads.commit.useMutation()
	const abandonMutation = trpc.uploads.abandon.useMutation()

	const openWithFile = useCallback(
		(file: File) => {
			if (!clientId) return
			if (file.size > MAX_UPLOAD_BYTES) {
				setState({
					status: "error",
					message: `File is too large (${formatBytes(file.size)}). Maximum is ${formatBytes(MAX_UPLOAD_BYTES)}.`,
				})
				return
			}
			if (!isSupportedClientMime(file.type)) {
				setState({
					status: "error",
					message: `Unsupported file type: ${file.type || "unknown"}. Drop a PDF, image, CSV, or XLSX.`,
				})
				return
			}

			setState({ status: "classifying", fileName: file.name })

			void (async () => {
				try {
					const dataBase64 = await fileToBase64(file)
					const res = await classifyMutation.mutateAsync({
						clientId,
						fileName: file.name,
						mime: file.type,
						dataBase64,
					})
					setState({
						status: "choosing",
						uploadId: res.uploadId,
						classification: res.classification,
						fileName: file.name,
					})
				} catch (err) {
					setState({
						status: "error",
						message:
							err instanceof Error
								? err.message
								: "Failed to classify document",
					})
				}
			})()
		},
		[clientId, classifyMutation],
	)

	const choose = useCallback(
		(entityKind: string) => {
			if (!clientId) return
			setState((current) => {
				if (current.status !== "choosing") return current
				const { uploadId, fileName } = current
				void runChoose({
					uploadId,
					entityKind,
					fileName,
					chooseMutation,
					setState,
				})
				return { status: "committing", uploadId, entityKind, fileName }
			})
		},
		[chooseMutation, clientId],
	)

	const submitReview = useCallback(
		(draft: CommitDraft) => {
			if (!clientId) return
			setState((current) => {
				if (current.status !== "reviewing") return current
				const { uploadId, entityKind, fileName } = current
				void runResolveAndCommit({
					uploadId,
					clientId,
					entityKind,
					fileName,
					draft,
					resolveRefsMutation,
					commitMutation,
					setState,
				})
				return { status: "committing", uploadId, entityKind, fileName }
			})
		},
		[clientId, commitMutation, resolveRefsMutation],
	)

	const submitResolutions = useCallback(
		(decisions: ResolutionDecision[]) => {
			if (!clientId) return
			setState((current) => {
				if (current.status !== "resolving_refs") return current
				const { uploadId, entityKind, fileName, draft } = current
				void runCommitWithResolutions({
					uploadId,
					clientId,
					entityKind,
					fileName,
					draft,
					decisions,
					commitMutation,
					setState,
				})
				return { status: "committing", uploadId, entityKind, fileName }
			})
		},
		[clientId, commitMutation],
	)

	const dismiss = useCallback(() => {
		setState((current) => {
			if (current.status === "choosing" || current.status === "reviewing") {
				void abandonMutation
					.mutateAsync({ uploadId: current.uploadId })
					.catch(() => {})
			}
			return { status: "idle" }
		})
	}, [abandonMutation])

	useEffect(() => {
		if (disabled) return

		const isFileDrag = (e: DragEvent): boolean => {
			const dt = e.dataTransfer
			if (!dt) return false
			return (
				Array.from(dt.types ?? []).includes("Files") ||
				(dt.items?.length ?? 0) > 0
			)
		}

		const onDragEnter = (e: DragEvent) => {
			if (!isFileDrag(e)) return
			e.preventDefault()
			dragCounter.current += 1
			setState((s) => (s.status === "idle" ? { status: "dragging" } : s))
		}
		const onDragOver = (e: DragEvent) => {
			if (!isFileDrag(e)) return
			e.preventDefault()
		}
		const onDragLeave = (e: DragEvent) => {
			if (!isFileDrag(e)) return
			e.preventDefault()
			dragCounter.current = Math.max(0, dragCounter.current - 1)
			if (dragCounter.current === 0) {
				setState((s) => (s.status === "dragging" ? { status: "idle" } : s))
			}
		}
		const onDrop = (e: DragEvent) => {
			if (!isFileDrag(e)) return
			e.preventDefault()
			dragCounter.current = 0
			const file = e.dataTransfer?.files?.[0]
			if (!file) {
				setState((s) => (s.status === "dragging" ? { status: "idle" } : s))
				return
			}
			openWithFile(file)
		}

		window.addEventListener("dragenter", onDragEnter)
		window.addEventListener("dragover", onDragOver)
		window.addEventListener("dragleave", onDragLeave)
		window.addEventListener("drop", onDrop)
		return () => {
			window.removeEventListener("dragenter", onDragEnter)
			window.removeEventListener("dragover", onDragOver)
			window.removeEventListener("dragleave", onDragLeave)
			window.removeEventListener("drop", onDrop)
		}
	}, [disabled, openWithFile])

	return (
		<DropZoneContext.Provider
			value={{
				state,
				openWithFile,
				choose,
				submitReview,
				submitResolutions,
				dismiss,
				disabled,
			}}
		>
			{children}
			<DropZoneOverlay visible={state.status === "dragging"} />
			<UploadWizard
				state={state}
				onChoose={choose}
				onSubmitReview={submitReview}
				onSubmitResolutions={submitResolutions}
				onDismiss={dismiss}
			/>
		</DropZoneContext.Provider>
	)
}

async function runChoose(args: {
	uploadId: string
	entityKind: string
	fileName: string
	chooseMutation: ChooseMutation
	setState: (next: DropZoneState) => void
}): Promise<void> {
	const { uploadId, entityKind, fileName, chooseMutation, setState } = args
	try {
		const chooseRes = await chooseMutation.mutateAsync({ uploadId, entityKind })
		const draft = chooseRes.draft

		if (draft.kind === null) {
			const outcome: ChosenOutcome =
				draft.reason === "missing_fields"
					? { kind: "drafted_pending_review", missing: draft.missing }
					: { kind: "recorded_no_post", reason: "kind_not_translatable" }
			emitChosen({ setState, uploadId, entityKind, fileName, outcome })
			return
		}

		const commitDraft = narrowCommitInput(draft)
		setState({
			status: "reviewing",
			uploadId,
			entityKind,
			fileName,
			draft: commitDraft,
		})
	} catch (err) {
		setState({
			status: "error",
			message: err instanceof Error ? err.message : "Failed to draft entity",
		})
	}
}

async function runResolveAndCommit(args: {
	uploadId: string
	clientId: string
	entityKind: string
	fileName: string
	draft: CommitDraft
	resolveRefsMutation: ResolveRefsMutation
	commitMutation: CommitMutation
	setState: (next: DropZoneState) => void
}): Promise<void> {
	const {
		uploadId,
		clientId,
		entityKind,
		fileName,
		draft,
		resolveRefsMutation,
		commitMutation,
		setState,
	} = args
	try {
		const resolveRes = await resolveRefsMutation.mutateAsync({
			clientId,
			commit: draft,
		})

		if (resolveRes.status === "needs_prompt") {
			setState({
				status: "resolving_refs",
				uploadId,
				entityKind,
				fileName,
				draft: resolveRes.commit,
				prompts: resolveRes.prompts,
			})
			return
		}

		const outcome = await postCommit({
			uploadId,
			clientId,
			commit: resolveRes.commit,
			commitMutation,
		})
		emitChosen({ setState, uploadId, entityKind, fileName, outcome })
	} catch (err) {
		setState({
			status: "error",
			message:
				err instanceof Error ? err.message : "Failed to file upload to QBO",
		})
	}
}

async function runCommitWithResolutions(args: {
	uploadId: string
	clientId: string
	entityKind: string
	fileName: string
	draft: CommitDraft
	decisions: ResolutionDecision[]
	commitMutation: CommitMutation
	setState: (next: DropZoneState) => void
}): Promise<void> {
	const {
		uploadId,
		clientId,
		entityKind,
		fileName,
		draft,
		decisions,
		commitMutation,
		setState,
	} = args
	try {
		const outcome = await postCommit({
			uploadId,
			clientId,
			commit: draft,
			resolutions: decisions,
			commitMutation,
		})
		emitChosen({ setState, uploadId, entityKind, fileName, outcome })
	} catch (err) {
		setState({
			status: "error",
			message:
				err instanceof Error ? err.message : "Failed to file upload to QBO",
		})
	}
}

async function postCommit(args: {
	uploadId: string
	clientId: string
	commit: CommitDraft
	resolutions?: ResolutionDecision[]
	commitMutation: CommitMutation
}): Promise<ChosenOutcome> {
	const { uploadId, clientId, commit, resolutions, commitMutation } = args
	const res = await commitMutation.mutateAsync({
		uploadId,
		clientId,
		commit,
		resolutions,
	})
	if (res.status === "created") {
		return {
			kind: "posted",
			createdEntityId: res.createdEntityId,
			qboAttachableId: res.qboAttachableId,
			entityHref: res.entityHref,
			warning: null,
		}
	}
	return {
		kind: "posted",
		createdEntityId: res.createdEntityId,
		qboAttachableId: null,
		entityHref: res.entityHref,
		warning: "Entity posted, but the source file did not attach.",
	}
}

function emitChosen(args: {
	setState: (next: DropZoneState) => void
	uploadId: string
	entityKind: string
	fileName: string
	outcome: ChosenOutcome
}): void {
	const { setState, uploadId, entityKind, fileName, outcome } = args
	setState({ status: "chosen", uploadId, entityKind, fileName, outcome })
	toast.success(toastTitle(outcome, entityKind), {
		description: toastDescription(outcome, fileName),
		action:
			outcome.kind === "posted"
				? {
						label: "View in QuickBooks",
						onClick: () =>
							window.open(outcome.entityHref, "_blank", "noopener,noreferrer"),
					}
				: undefined,
	})
}

type ChooseDraftResult = Awaited<
	ReturnType<ChooseMutation["mutateAsync"]>
>["draft"]

type CommitInput = Parameters<CommitMutation["mutateAsync"]>[0]["commit"]
type CommittableDraft = Extract<ChooseDraftResult, { kind: string }>

// TS can't correlate `draft.kind` with `draft.payload` after they're plucked
// apart, so we switch on the kind to reconstruct a discriminated-union member.
function narrowCommitInput(draft: CommittableDraft): CommitInput {
	switch (draft.kind) {
		case "SalesReceipt":
			return { entityKind: "SalesReceipt", payload: draft.payload }
		case "Invoice":
			return { entityKind: "Invoice", payload: draft.payload }
		case "Customer":
			return { entityKind: "Customer", payload: draft.payload }
		case "Bill":
			return { entityKind: "Bill", payload: draft.payload }
		case "Vendor":
			return { entityKind: "Vendor", payload: draft.payload }
	}
}

function toastTitle(outcome: ChosenOutcome, entityKind: string): string {
	switch (outcome.kind) {
		case "posted":
			return outcome.warning
				? `${entityKind} posted (no attachment)`
				: `${entityKind} posted to QuickBooks`
		case "drafted_pending_review":
			return `${entityKind} needs review`
		case "recorded_no_post":
			return `${entityKind} recorded`
	}
}

function toastDescription(outcome: ChosenOutcome, fileName: string): string {
	switch (outcome.kind) {
		case "posted":
			return outcome.warning ? `${fileName} · ${outcome.warning}` : fileName
		case "drafted_pending_review":
			return `${fileName} · missing ${outcome.missing.join(", ")}`
		case "recorded_no_post":
			return `${fileName} · QBO posting for this kind ships with #12`
	}
}

async function fileToBase64(file: File): Promise<string> {
	const dataUrl = await new Promise<string>((resolve, reject) => {
		const reader = new FileReader()
		reader.onload = () => resolve(reader.result as string)
		reader.onerror = () => reject(reader.error ?? new Error("File read failed"))
		reader.readAsDataURL(file)
	})
	const comma = dataUrl.indexOf(",")
	return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl
}

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
	return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
