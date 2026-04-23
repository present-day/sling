import { createAnthropic } from "@ai-sdk/anthropic";
import { createId } from "@paralleldrive/cuid2";
import { streamText } from "ai";
import { and, asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getEnv } from "@/lib/env";
import { auth } from "@/server/auth";
import { db } from "@/server/db/client";
import { chatMessages, chatThreads } from "@/server/db/schema";
import type {
	Finding,
	NarrativePayload,
} from "@/server/reports/month-end/types";

const MODEL = "claude-sonnet-4-20250514" as const;

const messageSchema = z.object({
	role: z.enum(["user", "assistant"]),
	content: z.string(),
});

const bodySchema = z.object({
	message: z.string().min(1).max(4_000),
	/** Optional thread id. If omitted, a new thread is created for this close. */
	threadId: z.string().optional(),
});

function mapCloseChatError(error: unknown): { status: number; message: string } {
	const raw = error instanceof Error ? error.message : String(error);
	const normalized = raw.toLowerCase();
	if (normalized.includes("credit balance is too low")) {
		return {
			status: 503,
			message:
				"Close review chat is temporarily unavailable because the AI provider account is out of credits. Please contact your admin to update billing.",
		};
	}
	return {
		status: 500,
		message:
			"Close review chat failed due to an upstream AI error. Please try again shortly.",
	};
}

function buildSystemPrompt(close: {
	periodStart: string;
	periodEnd: string;
	accountingMethod: "Accrual" | "Cash";
	findings: Finding[];
	narrative: NarrativePayload;
}): string {
	const findingsContext = close.findings.map((f) => ({
		id: f.id,
		detector: f.detector,
		severity: f.severity,
		title: f.title,
		evidence: f.evidence,
		affectedLinePaths: f.affectedLinePaths,
		suggestedAction: f.suggestedAction,
	}));

	return `You are a senior bookkeeper's assistant reviewing a month-end close.

Period: ${close.periodStart} to ${close.periodEnd}
Basis: ${close.accountingMethod}

Narrative already written:
"""
${close.narrative.summary}
"""

Deterministic findings detected by the close engine:
${JSON.stringify(findingsContext, null, 2)}

Rules:
- Answer questions about these findings, the period totals, and what to investigate next.
- Reference findings by their id in square brackets, e.g. [material_expenses-rent-1200].
- Do NOT invent variances, dollar amounts, or GL accounts not present in the findings above. If the bookkeeper asks something you can't answer from this context, say so and suggest where to look (e.g. "open the Rent account in QBO to see the underlying transactions").
- Keep answers short (2–5 sentences) and reviewer-focused. No fluff.`;
}

export async function POST(
	req: Request,
	ctx: { params: Promise<{ closeId: string }> },
) {
	const session = await auth.api.getSession({ headers: req.headers });
	if (!session?.user) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}
	const orgId = session.session?.activeOrganizationId;
	if (!orgId) {
		return NextResponse.json(
			{ error: "Select an organization first" },
			{ status: 400 },
		);
	}

	const { closeId } = await ctx.params;
	const parsedBody = bodySchema.safeParse(await req.json().catch(() => null));
	if (!parsedBody.success) {
		return NextResponse.json(
			{ error: parsedBody.error.message },
			{ status: 400 },
		);
	}

	const close = await db.query.monthEndCloses.findFirst({
		where: (c, { eq: eqFn, and: andFn }) =>
			andFn(eqFn(c.id, closeId), eqFn(c.orgId, orgId)),
	});
	if (!close) {
		return NextResponse.json({ error: "Close not found" }, { status: 404 });
	}

	let threadId = parsedBody.data.threadId;
	if (threadId) {
		const existing = await db.query.chatThreads.findFirst({
			where: (t, { eq: eqFn, and: andFn }) =>
				andFn(
					eqFn(t.id, threadId as string),
					eqFn(t.orgId, orgId),
					eqFn(t.userId, session.user.id),
				),
		});
		if (!existing) {
			return NextResponse.json({ error: "Thread not found" }, { status: 404 });
		}
	} else {
		threadId = createId();
		await db.insert(chatThreads).values({
			id: threadId,
			orgId,
			clientId: close.clientId,
			userId: session.user.id,
			title: `Close ${close.periodStart} — ${close.periodEnd}`,
			contextKind: "month_end_close",
			contextId: closeId,
		});
	}

	await db.insert(chatMessages).values({
		id: createId(),
		threadId,
		role: "user",
		content: { text: parsedBody.data.message },
	});

	const history = await db
		.select({ role: chatMessages.role, content: chatMessages.content })
		.from(chatMessages)
		.where(eq(chatMessages.threadId, threadId))
		.orderBy(asc(chatMessages.createdAt));

	const messages: { role: "user" | "assistant"; content: string }[] = [];
	for (const m of history) {
		if (m.role !== "user" && m.role !== "assistant") {
			continue;
		}
		const payload = m.content as { text?: string } | null;
		if (!payload?.text) {
			continue;
		}
		messages.push({ role: m.role, content: payload.text });
	}

	const env = getEnv();
	const anthropic = createAnthropic({ apiKey: env.ANTHROPIC_API_KEY });

	try {
		const result = await streamText({
			model: anthropic(MODEL),
			temperature: 0.2,
			system: buildSystemPrompt({
				periodStart: close.periodStart,
				periodEnd: close.periodEnd,
				accountingMethod: close.accountingMethod,
				findings: (close.findings as Finding[]) ?? [],
				narrative: close.narrative as NarrativePayload,
			}),
			messages,
			onFinish: async ({ text }) => {
				await db.insert(chatMessages).values({
					id: createId(),
					threadId,
					role: "assistant",
					content: { text },
				});
			},
		});

		const response = result.toTextStreamResponse();
		response.headers.set("X-Thread-Id", threadId);
		return response;
	} catch (error) {
		const mapped = mapCloseChatError(error);
		console.error("Month-end close chat failed", {
			closeId,
			threadId,
			error,
		});
		return NextResponse.json({ error: mapped.message }, { status: mapped.status });
	}
}

export async function GET(
	req: Request,
	ctx: { params: Promise<{ closeId: string }> },
) {
	const session = await auth.api.getSession({ headers: req.headers });
	if (!session?.user) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}
	const orgId = session.session?.activeOrganizationId;
	if (!orgId) {
		return NextResponse.json(
			{ error: "Select an organization first" },
			{ status: 400 },
		);
	}

	const { closeId } = await ctx.params;
	const thread = await db.query.chatThreads.findFirst({
		where: (t, { eq: eqFn, and: andFn }) =>
			andFn(
				eqFn(t.contextKind, "month_end_close"),
				eqFn(t.contextId, closeId),
				eqFn(t.orgId, orgId),
				eqFn(t.userId, session.user.id),
			),
		orderBy: (t, { desc: descFn }) => descFn(t.createdAt),
	});
	if (!thread) {
		return NextResponse.json({ threadId: null, messages: [] });
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
		.orderBy(asc(chatMessages.createdAt));
	return NextResponse.json({
		threadId: thread.id,
		messages: messages
			.filter((m) => m.role === "user" || m.role === "assistant")
			.map((m) => {
				const p = messageSchema.safeParse({
					role: m.role,
					content: (m.content as { text?: string } | null)?.text ?? "",
				});
				return p.success ? p.data : null;
			})
			.filter(
				(v): v is { role: "user" | "assistant"; content: string } => v !== null,
			),
	});
}
