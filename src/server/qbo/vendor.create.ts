import "server-only"
import type { clients } from "@/server/db/schema"
import { type IntuitClient, makeIntuitClient } from "@/server/qbo/intuit-client"
import {
	type VendorDraft,
	vendorDraftSchema,
} from "@/server/uploads/translators/types"

type ClientRow = typeof clients.$inferSelect

export async function createVendor(
	client: ClientRow,
	draft: VendorDraft,
	intuit: IntuitClient = makeIntuitClient(client),
): Promise<{ id: string }> {
	const body = vendorDraftSchema.parse(draft)
	const res = await intuit.createEntity<{ Vendor: { Id: string } }>(
		"vendor",
		body,
	)
	return { id: res.Vendor.Id }
}
