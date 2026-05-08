import { createId } from "@paralleldrive/cuid2"
import { TRPCError } from "@trpc/server"
import { z } from "zod"
import { clientMembers, clients } from "@/server/db/schema"
import { encryptRefreshToken } from "@/server/qbo/tokens"
import { orgProcedure, router } from "../init"

export const clientsRouter = router({
	list: orgProcedure.query(async ({ ctx }) => {
		const rows = await ctx.db.query.clients.findMany({
			where: (c, { eq: eqFn }) => eqFn(c.orgId, ctx.orgId),
		})
		return z
			.array(
				z.object({
					id: z.string(),
					name: z.string(),
					realmId: z.string(),
					environment: z.enum(["sandbox", "production"]),
					createdAt: z.date(),
				}),
			)
			.parse(
				rows.map((r) => ({
					...r,
					createdAt: new Date(r.createdAt),
				})),
			)
	}),
	createStub: orgProcedure
		.input(
			z.object({
				name: z.string().min(1),
				realmId: z.string().min(1),
				environment: z.enum(["sandbox", "production"]).default("sandbox"),
				refreshToken: z.string().min(1),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const id = createId()
			const enc = encryptRefreshToken(input.refreshToken)
			await ctx.db.insert(clients).values({
				id,
				orgId: ctx.orgId,
				name: input.name,
				realmId: input.realmId,
				environment: input.environment,
				encryptedRefreshToken: enc,
				tokenUpdatedAt: new Date(),
				createdAt: new Date(),
			})
			await ctx.db.insert(clientMembers).values({
				id: createId(),
				clientId: id,
				userId: ctx.session.user.id,
				role: "admin",
			})
			return z.object({ id: z.string() }).parse({ id })
		}),
	get: orgProcedure
		.input(z.object({ clientId: z.string() }))
		.query(async ({ ctx, input }) => {
			const row = await ctx.db.query.clients.findFirst({
				where: (c, { eq: eqFn, and: andFn }) =>
					andFn(eqFn(c.id, input.clientId), eqFn(c.orgId, ctx.orgId)),
			})
			if (!row) {
				throw new TRPCError({ code: "NOT_FOUND" })
			}
			return z
				.object({
					id: z.string(),
					name: z.string(),
					realmId: z.string(),
					environment: z.enum(["sandbox", "production"]),
				})
				.parse(row)
		}),
})
