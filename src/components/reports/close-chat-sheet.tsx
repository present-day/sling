"use client"

import { SendIcon } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"

type ChatMessage = {
	id: string
	role: "user" | "assistant"
	content: string
}

async function readApiError(res: Response): Promise<string> {
	const body = (await res.json().catch(() => ({}))) as { error?: string }
	return body.error ?? `Chat failed (${res.status})`
}

function newId(): string {
	if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
		return crypto.randomUUID()
	}
	return `m-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function CloseChatSheet({
	closeId,
	open,
	onOpenChange,
	periodLabel,
}: {
	closeId: string
	open: boolean
	onOpenChange: (v: boolean) => void
	periodLabel: string
}) {
	const [messages, setMessages] = useState<ChatMessage[]>([])
	const [input, setInput] = useState("")
	const [pending, setPending] = useState(false)
	const [threadId, setThreadId] = useState<string | null>(null)
	const scrollRef = useRef<HTMLDivElement>(null)

	useEffect(() => {
		if (!open) {
			return
		}
		let cancelled = false
		;(async () => {
			try {
				const res = await fetch(`/api/chat/month-end-close/${closeId}`, {
					credentials: "include",
				})
				if (!res.ok) {
					toast.error(await readApiError(res))
					return
				}
				const data = (await res.json()) as {
					threadId: string | null
					messages: { role: "user" | "assistant"; content: string }[]
				}
				if (cancelled) {
					return
				}
				setThreadId(data.threadId)
				setMessages(data.messages.map((m) => ({ ...m, id: newId() })))
			} catch (e) {
				const message =
					e instanceof Error
						? e.message
						: "Failed to load close review chat history"
				toast.error(message)
			}
		})()
		return () => {
			cancelled = true
		}
	}, [open, closeId])

	useEffect(() => {
		if (scrollRef.current) {
			scrollRef.current.scrollTop = scrollRef.current.scrollHeight
		}
	}, [])

	const send = useCallback(async () => {
		const text = input.trim()
		if (!text || pending) {
			return
		}
		setInput("")
		setPending(true)
		const assistantId = newId()
		setMessages((prev) => [
			...prev,
			{ id: newId(), role: "user", content: text },
			{ id: assistantId, role: "assistant", content: "" },
		])
		try {
			const res = await fetch(`/api/chat/month-end-close/${closeId}`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				credentials: "include",
				body: JSON.stringify({
					message: text,
					threadId: threadId ?? undefined,
				}),
			})
			if (!res.ok || !res.body) {
				toast.error(await readApiError(res))
				setMessages((prev) => prev.slice(0, -1))
				return
			}
			const newThreadId = res.headers.get("X-Thread-Id")
			if (newThreadId) {
				setThreadId(newThreadId)
			}
			const reader = res.body.getReader()
			const decoder = new TextDecoder()
			let buffer = ""
			while (true) {
				const { value, done } = await reader.read()
				if (done) {
					break
				}
				buffer += decoder.decode(value, { stream: true })
				setMessages((prev) => {
					const next = [...prev]
					const last = next[next.length - 1]
					if (last && last.role === "assistant") {
						next[next.length - 1] = { ...last, content: buffer }
					}
					return next
				})
			}
			if (!buffer.trim()) {
				const fallback =
					"I could not generate a response because the AI provider returned no content. Please retry, and if it persists ask your admin to check provider billing and status."
				toast.error("Close review chat returned an empty response.")
				setMessages((prev) => {
					const next = [...prev]
					const last = next[next.length - 1]
					if (last && last.role === "assistant") {
						next[next.length - 1] = { ...last, content: fallback }
					}
					return next
				})
			}
		} catch (e) {
			const message = e instanceof Error ? e.message : String(e)
			toast.error(message)
			setMessages((prev) => prev.slice(0, -1))
		} finally {
			setPending(false)
		}
	}, [input, pending, closeId, threadId])

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent side="right" className="flex w-full max-w-md flex-col">
				<SheetHeader className="border-b">
					<SheetTitle>Close review chat</SheetTitle>
					<SheetDescription className="font-mono text-xs">
						{periodLabel} · context seeded from the findings list
					</SheetDescription>
				</SheetHeader>
				<div
					ref={scrollRef}
					className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-3"
				>
					{messages.length === 0 ? (
						<p className="text-center text-xs text-muted-foreground">
							Ask a question about a specific finding, e.g. "Which detector
							flagged the rent variance?" or "What should I check before signing
							off?"
						</p>
					) : null}
					{messages.map((m, i) => {
						const isLast = i === messages.length - 1
						return (
							<div
								key={m.id}
								className={`rounded-lg px-3 py-2 text-sm leading-relaxed ${
									m.role === "user"
										? "self-end bg-primary text-primary-foreground"
										: "self-start bg-muted text-foreground"
								} max-w-[85%] whitespace-pre-wrap`}
							>
								{m.content ||
									(m.role === "assistant" && pending && isLast ? "…" : "")}
							</div>
						)
					})}
				</div>
				<div className="flex items-end gap-2 border-t p-3">
					<Textarea
						rows={2}
						value={input}
						placeholder="Ask about a finding…"
						onChange={(e) => setInput(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter" && !e.shiftKey) {
								e.preventDefault()
								void send()
							}
						}}
						disabled={pending}
						className="resize-none"
					/>
					<Button
						type="button"
						size="icon"
						onClick={() => void send()}
						disabled={pending || !input.trim()}
					>
						<SendIcon />
					</Button>
				</div>
			</SheetContent>
		</Sheet>
	)
}
