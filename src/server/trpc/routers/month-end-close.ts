import { createId } from "@paralleldrive/cuid2";
import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import {
	monthEndCloses,
	monthEndFindingDispositions,
} from "@/server/db/schema";
import { runMonthEndClose } from "@/server/reports/month-end/run";
import {
	findingSchema,
	narrativePayloadSchema,
} from "@/server/reports/month-end/types";
import { orgProcedure, router } from "../init";

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

const dispositionSchema = z.enum(["accepted", "dismissed", "noted"]);

const closeRowSchema = z.object({
	id: z.string(),
	clientId: z.string(),
	periodStart: z.string(),
	periodEnd: z.string(),
	accountingMethod: z.enum(["Accrual", "Cash"]),
	baselineKey: z.string(),
	status: z.enum(["open", "signed_off"]),
	findings: z.array(findingSchema),
	narrative: narrativePayloadSchema,
	createdAt: z.date(),
	dispositions: z.array(
		z.object({
			findingId: z.string(),
			disposition: dispositionSchema,
			note: z.string().nullable(),
			updatedAt: z.date(),
		}),
	),
});

async function fetchCloseWithDispositions(
	ctx: { db: typeof import("@/server/db/client").db },
	orgId: string,
	closeId: string,
) {
	const row = await ctx.db.query.monthEndCloses.findFirst({
		where: (c, { eq: eqFn, and: andFn }) =>
			andFn(eqFn(c.id, closeId), eqFn(c.orgId, orgId)),
		with: { dispositions: true },
	});
	if (!row) {
		throw new TRPCError({ code: "NOT_FOUND", message: "Close not found" });
	}
	return row;
}

function serializeClose(row: {
	id: string;
	clientId: string;
	periodStart: string;
	periodEnd: string;
	accountingMethod: "Accrual" | "Cash";
	baselineKey: string;
	status: "open" | "signed_off";
	findings: unknown;
	narrative: unknown;
	createdAt: Date | number;
	dispositions: {
		findingId: string;
		disposition: "accepted" | "dismissed" | "noted";
		note: string | null;
		updatedAt: Date | number;
	}[];
}) {
	return closeRowSchema.parse({
		id: row.id,
		clientId: row.clientId,
		periodStart: row.periodStart,
		periodEnd: row.periodEnd,
		accountingMethod: row.accountingMethod,
		baselineKey: row.baselineKey,
		status: row.status,
		findings: row.findings,
		narrative: row.narrative,
		createdAt: new Date(row.createdAt),
		dispositions: row.dispositions.map((d) => ({
			findingId: d.findingId,
			disposition: d.disposition,
			note: d.note,
			updatedAt: new Date(d.updatedAt),
		})),
	});
}

export const monthEndCloseRouter = router({
	run: orgProcedure
		.input(
			z.object({
				clientId: z.string(),
				startDate: z.string().regex(dateRegex),
				endDate: z.string().regex(dateRegex),
				accountingMethod: z.enum(["Accrual", "Cash"]).optional(),
				baselineKey: z.string().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			try {
				const result = await runMonthEndClose({
					orgId: ctx.orgId,
					clientId: input.clientId,
					userId: ctx.session.user.id,
					startDate: input.startDate,
					endDate: input.endDate,
					accountingMethod: input.accountingMethod,
					baselineKey: input.baselineKey,
				});
				const row = await fetchCloseWithDispositions(ctx, ctx.orgId, result.id);
				return serializeClose(row);
			} catch (e) {
				const message =
					e instanceof Error ? e.message : "Month-end close failed";
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message,
				});
			}
		}),

	getLatestForPeriod: orgProcedure
		.input(
			z.object({
				clientId: z.string(),
				startDate: z.string().regex(dateRegex),
				endDate: z.string().regex(dateRegex),
			}),
		)
		.query(async ({ ctx, input }) => {
			const row = await ctx.db.query.monthEndCloses.findFirst({
				where: (c, { eq: eqFn, and: andFn }) =>
					andFn(
						eqFn(c.orgId, ctx.orgId),
						eqFn(c.clientId, input.clientId),
						eqFn(c.periodStart, input.startDate),
						eqFn(c.periodEnd, input.endDate),
					),
				orderBy: (c, { desc: descFn }) => descFn(c.createdAt),
				with: { dispositions: true },
			});
			if (!row) {
				return null;
			}
			return serializeClose(row);
		}),

	getById: orgProcedure
		.input(z.object({ closeId: z.string() }))
		.query(async ({ ctx, input }) => {
			const row = await fetchCloseWithDispositions(
				ctx,
				ctx.orgId,
				input.closeId,
			);
			return serializeClose(row);
		}),

	listByClient: orgProcedure
		.input(
			z.object({
				clientId: z.string(),
				limit: z.number().int().min(1).max(50).default(20),
			}),
		)
		.query(async ({ ctx, input }) => {
			const rows = await ctx.db
				.select({
					id: monthEndCloses.id,
					clientId: monthEndCloses.clientId,
					periodStart: monthEndCloses.periodStart,
					periodEnd: monthEndCloses.periodEnd,
					status: monthEndCloses.status,
					createdAt: monthEndCloses.createdAt,
				})
				.from(monthEndCloses)
				.where(
					and(
						eq(monthEndCloses.orgId, ctx.orgId),
						eq(monthEndCloses.clientId, input.clientId),
					),
				)
				.orderBy(desc(monthEndCloses.createdAt))
				.limit(input.limit);
			return z
				.array(
					z.object({
						id: z.string(),
						clientId: z.string(),
						periodStart: z.string(),
						periodEnd: z.string(),
						status: z.enum(["open", "signed_off"]),
						createdAt: z.date(),
					}),
				)
				.parse(
					rows.map((r) => ({
						...r,
						createdAt: new Date(r.createdAt),
					})),
				);
		}),

	setDisposition: orgProcedure
		.input(
			z.object({
				closeId: z.string(),
				findingId: z.string(),
				disposition: dispositionSchema,
				note: z.string().max(2_000).nullable().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const close = await ctx.db.query.monthEndCloses.findFirst({
				where: (c, { eq: eqFn, and: andFn }) =>
					andFn(eqFn(c.id, input.closeId), eqFn(c.orgId, ctx.orgId)),
			});
			if (!close) {
				throw new TRPCError({ code: "NOT_FOUND", message: "Close not found" });
			}
			const findings = (close.findings as { id: string }[]) ?? [];
			if (!findings.some((f) => f.id === input.findingId)) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Finding not part of this close",
				});
			}
			const existing = await ctx.db.query.monthEndFindingDispositions.findFirst(
				{
					where: (d, { eq: eqFn, and: andFn }) =>
						andFn(
							eqFn(d.closeId, input.closeId),
							eqFn(d.findingId, input.findingId),
						),
				},
			);
			if (existing) {
				await ctx.db
					.update(monthEndFindingDispositions)
					.set({
						disposition: input.disposition,
						note: input.note ?? null,
						userId: ctx.session.user.id,
					})
					.where(eq(monthEndFindingDispositions.id, existing.id));
			} else {
				await ctx.db.insert(monthEndFindingDispositions).values({
					id: createId(),
					closeId: input.closeId,
					findingId: input.findingId,
					disposition: input.disposition,
					note: input.note ?? null,
					userId: ctx.session.user.id,
				});
			}
			return z.object({ ok: z.literal(true) }).parse({ ok: true });
		}),
});
