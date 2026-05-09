import { createAnthropic } from "@ai-sdk/anthropic"
import { createId } from "@paralleldrive/cuid2"
import { streamText } from "ai"
import { and, asc, eq } from "drizzle-orm"
import { NextResponse } from "next/server"
import { z } from "zod"
import { isTabScope, TAB_LABELS, type TabScope } from "@/lib/cockpit"
import { getEnv } from "@/lib/env"
import { auth } from "@/server/auth"
import { buildCockpitScopeSystemPrompt } from "@/server/chat/cockpit-scope-prompts"
import { db } from "@/server/db/client"
import { chatMessages, chatThreads } from "@/server/db/schema"

const MODEL = "claude-sonnet-4-20250514" as const

const bodySchema = z.object({
	message: z.string().min(1).max(4_000),
	/** Optional thread id. If omitted, the user's latest cockpit thread for
	 * this (clientId, scope) is reused; if none exists, a new one is created. */
	threadId: z.string().optional(),
})

type Params = { clientId: string; scope: string }

function unauthorizedOrBadOrg(
	session: Awaited<ReturnType<typeof auth.api.getSession>>,
) {
	if (!session?.user) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
	}
	const orgId = session.session?.activeOrganizationId
	if (!orgId) {
		return NextResponse.json(
			{ error: "Select an organization first" },
			{ status: 400 },
		)
	}
	return null
}

async function ensureClientInOrg(clientId: string, orgId: string) {
	return db.query.clients.findFirst({
		where: (c, { eq: eqFn, and: andFn }) =>
			andFn(eqFn(c.id, clientId), eqFn(c.orgId, orgId)),
	})
}

function mapScopeChatError(error: unknown): {
	status: number
	message: string
} {
	const raw = error instanceof Error ? error.message : String(error)
	const normalized = raw.toLowerCase()
	if (normalized.includes("credit balance is too low")) {
		return {
			status: 503,
			message:
				"Scoped chat is temporarily unavailable because the AI provider account is out of credits.",
		}
	}
	return {
		status: 500,
		message:
			"Scoped chat failed due to an upstream AI error. Please try again shortly.",
	}
}

async function findLatestScopeThread({
	orgId,
	clientId,
	userId,
	scope,
}: {
	orgId: string
	clientId: string
	userId: string
	scope: TabScope
}) {
	return db.query.chatThreads.findFirst({
		where: (t, { eq: eqFn, and: andFn }) =>
			andFn(
				eqFn(t.contextKind, "cockpit_scope"),
				eqFn(t.contextId, scope),
				eqFn(t.orgId, orgId),
				eqFn(t.clientId, clientId),
				eqFn(t.userId, userId),
			),
		orderBy: (t, { desc: descFn }) => descFn(t.createdAt),
	})
}

export async function POST(req: Request, ctx: { params: Promise<Params> }) {
	const session = await auth.api.getSession({ headers: req.headers })
	const guard = unauthorizedOrBadOrg(session)
	if (guard) return guard
	if (!session?.user)
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
	const orgId = session.session?.activeOrganizationId
	if (!orgId)
		return NextResponse.json(
			{ error: "Select an organization first" },
			{ status: 400 },
		)

	const { clientId, scope } = await ctx.params
	if (!isTabScope(scope)) {
		return NextResponse.json(
			{ error: `Unknown cockpit scope: ${scope}` },
			{ status: 400 },
		)
	}
	const client = await ensureClientInOrg(clientId, orgId)
	if (!client) {
		return NextResponse.json({ error: "Client not found" }, { status: 404 })
	}

	const parsedBody = bodySchema.safeParse(await req.json().catch(() => null))
	if (!parsedBody.success) {
		return NextResponse.json(
			{ error: parsedBody.error.message },
			{ status: 400 },
		)
	}

	let threadId = parsedBody.data.threadId
	if (threadId) {
		const existing = await db.query.chatThreads.findFirst({
			where: (t, { eq: eqFn, and: andFn }) =>
				andFn(
					eqFn(t.id, threadId as string),
					eqFn(t.orgId, orgId),
					eqFn(t.userId, session.user.id),
				),
		})
		if (!existing) {
			return NextResponse.json({ error: "Thread not found" }, { status: 404 })
		}
	} else {
		threadId = createId()
		await db.insert(chatThreads).values({
			id: threadId,
			orgId,
			clientId,
			userId: session.user.id,
			title: `${TAB_LABELS[scope]} · ${client.name}`,
			contextKind: "cockpit_scope",
			contextId: scope,
		})
	}

	await db.insert(chatMessages).values({
		id: createId(),
		threadId,
		role: "user",
		content: { text: parsedBody.data.message },
	})

	const history = await db
		.select({ role: chatMessages.role, content: chatMessages.content })
		.from(chatMessages)
		.where(eq(chatMessages.threadId, threadId))
		.orderBy(asc(chatMessages.createdAt))

	const messages: { role: "user" | "assistant"; content: string }[] = []
	for (const m of history) {
		if (m.role !== "user" && m.role !== "assistant") continue
		const payload = m.content as { text?: string } | null
		if (!payload?.text) continue
		messages.push({ role: m.role, content: payload.text })
	}

	const env = getEnv()
	const anthropic = createAnthropic({ apiKey: env.ANTHROPIC_API_KEY })

	try {
		const result = await streamText({
			model: anthropic(MODEL),
			temperature: 0.2,
			system: buildCockpitScopeSystemPrompt(scope),
			messages,
			onFinish: async ({ text }) => {
				await db.insert(chatMessages).values({
					id: createId(),
					threadId,
					role: "assistant",
					content: { text },
				})
			},
		})

		const response = result.toTextStreamResponse()
		response.headers.set("X-Thread-Id", threadId)
		return response
	} catch (error) {
		const mapped = mapScopeChatError(error)
		console.error("Cockpit scope chat failed", {
			clientId,
			scope,
			threadId,
			error,
		})
		return NextResponse.json(
			{ error: mapped.message },
			{ status: mapped.status },
		)
	}
}

export async function GET(req: Request, ctx: { params: Promise<Params> }) {
	const session = await auth.api.getSession({ headers: req.headers })
	if (!session?.user) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
	}
	const orgId = session.session?.activeOrganizationId
	if (!orgId) {
		return NextResponse.json(
			{ error: "Select an organization first" },
			{ status: 400 },
		)
	}

	const { clientId, scope } = await ctx.params
	if (!isTabScope(scope)) {
		return NextResponse.json(
			{ error: `Unknown cockpit scope: ${scope}` },
			{ status: 400 },
		)
	}
	const client = await ensureClientInOrg(clientId, orgId)
	if (!client) {
		return NextResponse.json({ error: "Client not found" }, { status: 404 })
	}

	const thread = await findLatestScopeThread({
		orgId,
		clientId,
		userId: session.user.id,
		scope,
	})
	if (!thread) {
		return NextResponse.json({ threadId: null, messages: [] })
	}

	const messages = await db
		.select({ role: chatMessages.role, content: chatMessages.content })
		.from(chatMessages)
		.where(
			and(
				eq(chatMessages.threadId, thread.id),
				eq(chatMessages.role, chatMessages.role),
			),
		)
		.orderBy(asc(chatMessages.createdAt))

	const out = messages
		.filter((m) => m.role === "user" || m.role === "assistant")
		.map((m) => {
			const text = (m.content as { text?: string } | null)?.text ?? ""
			return text
				? { role: m.role as "user" | "assistant", content: text }
				: null
		})
		.filter(
			(v): v is { role: "user" | "assistant"; content: string } => v !== null,
		)

	return NextResponse.json({ threadId: thread.id, messages: out })
}
