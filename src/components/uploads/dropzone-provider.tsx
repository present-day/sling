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
import type { DropZoneContextValue, DropZoneState } from "./dropzone-types"
import { isSupportedClientMime, MAX_UPLOAD_BYTES } from "./supported-mime"
import { UploadWizard } from "./upload-wizard"

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
			setState((current) => {
				if (current.status !== "choosing") return current
				const { uploadId, fileName } = current
				void chooseMutation
					.mutateAsync({ uploadId, entityKind })
					.then(() => {
						setState({
							status: "chosen",
							uploadId,
							entityKind,
							fileName,
						})
						toast.success(`Filed as ${entityKind}`, { description: fileName })
					})
					.catch((err: unknown) => {
						setState({
							status: "error",
							message:
								err instanceof Error ? err.message : "Failed to record choice",
						})
					})
				return current
			})
		},
		[chooseMutation],
	)

	const dismiss = useCallback(() => {
		setState((current) => {
			if (current.status === "choosing") {
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
			value={{ state, openWithFile, choose, dismiss, disabled }}
		>
			{children}
			<DropZoneOverlay visible={state.status === "dragging"} />
			<UploadWizard state={state} onChoose={choose} onDismiss={dismiss} />
		</DropZoneContext.Provider>
	)
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
