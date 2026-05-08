import { desc, eq } from "drizzle-orm"
import { z } from "zod"
import { chatThreads } from "@/server/db/schema"
import { orgProcedure, router } from "../init"

export const chatRouter = router({
	listThreads: orgProcedure.query(async ({ ctx }) => {
		const threads = await ctx.db
			.select()
			.from(chatThreads)
			.where(eq(chatThreads.orgId, ctx.orgId))
			.orderBy(desc(chatThreads.createdAt))
			.limit(50)
		return z
			.array(
				z.object({
					id: z.string(),
					clientId: z.string().nullable(),
					title: z.string().nullable(),
					createdAt: z.date(),
				}),
			)
			.parse(
				threads.map((t) => ({
					...t,
					createdAt: new Date(t.createdAt),
				})),
			)
	}),
})
