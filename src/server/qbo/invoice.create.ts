import "server-only"
import type { clients } from "@/server/db/schema"
import { type IntuitClient, makeIntuitClient } from "@/server/qbo/intuit-client"
import {
	type InvoiceDraft,
	invoiceDraftSchema,
} from "@/server/uploads/translators/types"

type ClientRow = typeof clients.$inferSelect

export async function createInvoice(
	client: ClientRow,
	draft: InvoiceDraft,
	intuit: IntuitClient = makeIntuitClient(client),
): Promise<{ id: string }> {
	const body = invoiceDraftSchema.parse(draft)
	const res = await intuit.createEntity<{ Invoice: { Id: string } }>(
		"invoice",
		body,
	)
	return { id: res.Invoice.Id }
}
