import "server-only"
import type { clients } from "@/server/db/schema"
import { type IntuitClient, makeIntuitClient } from "@/server/qbo/intuit-client"
import {
	type CustomerDraft,
	customerDraftSchema,
} from "@/server/uploads/translators/types"

type ClientRow = typeof clients.$inferSelect

export async function createCustomer(
	client: ClientRow,
	draft: CustomerDraft,
	intuit: IntuitClient = makeIntuitClient(client),
): Promise<{ id: string }> {
	const body = customerDraftSchema.parse(draft)
	const res = await intuit.createEntity<{ Customer: { Id: string } }>(
		"customer",
		body,
	)
	return { id: res.Customer.Id }
}
