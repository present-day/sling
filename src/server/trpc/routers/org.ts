import { z } from "zod"
import { auth } from "@/server/auth"
import { orgProcedure, protectedProcedure, router } from "../init"

export const orgRouter = router({
	list: protectedProcedure.query(async ({ ctx }) => {
		const list = await ctx.db.query.member.findMany({
			where: (m, { eq }) => eq(m.userId, ctx.session.user.id),
			with: { organization: true },
		})
		return z
			.array(
				z.object({
					id: z.string(),
					name: z.string(),
					slug: z.string(),
					logo: z.string().nullable(),
				}),
			)
			.parse(list.map((m) => m.organization))
	}),
	setActive: protectedProcedure
		.input(z.object({ organizationId: z.string() }))
		.mutation(async ({ ctx, input }) => {
			await auth.api.setActiveOrganization({
				body: { organizationId: input.organizationId },
				headers: ctx.headers,
			})
			return z.object({ ok: z.literal(true) }).parse({ ok: true })
		}),
	branding: orgProcedure.query(async ({ ctx }) => {
		const org = await ctx.db.query.organization.findFirst({
			where: (o, { eq }) => eq(o.id, ctx.orgId),
		})
		if (!org) {
			throw new Error("Organization not found")
		}
		let meta: Record<string, unknown> = {}
		const raw = org.metadata
		if (typeof raw === "string" && raw.length > 0) {
			meta = JSON.parse(raw) as Record<string, unknown>
		} else if (raw && typeof raw === "object") {
			meta = raw as Record<string, unknown>
		}
		return z
			.object({
				productName: z.string().default("Console"),
				primaryColor: z.string().default("#6366f1"),
				supportEmail: z.string().email().optional(),
			})
			.parse({
				productName: meta.productName ?? "Console",
				primaryColor: meta.primaryColor ?? "#6366f1",
				supportEmail: meta.supportEmail,
			})
	}),
})
