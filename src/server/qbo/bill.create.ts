import "server-only"
import type { clients } from "@/server/db/schema"
import { type IntuitClient, makeIntuitClient } from "@/server/qbo/intuit-client"
import {
	type BillDraft,
	billDraftSchema,
} from "@/server/uploads/translators/types"

type ClientRow = typeof clients.$inferSelect

export async function createBill(
	client: ClientRow,
	draft: BillDraft,
	intuit: IntuitClient = makeIntuitClient(client),
): Promise<{ id: string }> {
	const body = billDraftSchema.parse(draft)
	const res = await intuit.createEntity<{ Bill: { Id: string } }>("bill", body)
	return { id: res.Bill.Id }
}
