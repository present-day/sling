import { TRPCError } from "@trpc/server"
import { db } from "@/server/db/client"
import type { clients } from "@/server/db/schema"

type ClientRow = typeof clients.$inferSelect

export async function ensureClientInOrg(
	orgId: string,
	clientId: string,
): Promise<ClientRow> {
	const row = await db.query.clients.findFirst({
		where: (c, { eq: eqFn, and: andFn }) =>
			andFn(eqFn(c.id, clientId), eqFn(c.orgId, orgId)),
	})
	if (!row) {
		throw new TRPCError({ code: "NOT_FOUND", message: "Client not found" })
	}
	return row
}
