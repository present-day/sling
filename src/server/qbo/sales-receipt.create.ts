import "server-only"
import type { clients } from "@/server/db/schema"
import { type IntuitClient, makeIntuitClient } from "@/server/qbo/intuit-client"
import {
	type SalesReceiptDraft,
	salesReceiptDraftSchema,
} from "@/server/uploads/translators/types"

type ClientRow = typeof clients.$inferSelect

export async function createSalesReceipt(
	client: ClientRow,
	draft: SalesReceiptDraft,
	intuit: IntuitClient = makeIntuitClient(client),
): Promise<{ id: string }> {
	const body = salesReceiptDraftSchema.parse(draft)
	const res = await intuit.createEntity<{ SalesReceipt: { Id: string } }>(
		"salesreceipt",
		body,
	)
	return { id: res.SalesReceipt.Id }
}
