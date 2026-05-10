import "server-only"
import type { ExtractedFields } from "@/server/uploads/entity-kinds"
import {
	type CustomerDraft,
	customerDraftSchema,
	TranslatorInputError,
} from "./types"

/**
 * Translate classifier-extracted fields into a Customer draft payload.
 *
 * QBO requires `DisplayName` (must be unique within the realm). We use
 * `customerName` when present, otherwise fall back to the company-name part
 * of the address block, then the email local-part. If none of those are
 * available, throw — the form has to collect a display name before posting.
 */
export function translateCustomer(fields: ExtractedFields): CustomerDraft {
	const displayName = pickDisplayName(fields)
	if (!displayName) {
		throw new TranslatorInputError(
			["displayName"],
			"Customer needs a display name (customerName, vendorName, or email).",
		)
	}

	const draft: CustomerDraft = {
		DisplayName: displayName,
		CompanyName: fields.customerName ?? fields.vendorName,
		PrimaryEmailAddr: fields.email ? { Address: fields.email } : undefined,
		PrimaryPhone: fields.phone ? { FreeFormNumber: fields.phone } : undefined,
		BillAddr: fields.address ? { Line1: fields.address } : undefined,
		Notes: fields.memo,
	}

	return customerDraftSchema.parse(draft)
}

function pickDisplayName(fields: ExtractedFields): string | undefined {
	if (fields.customerName) return fields.customerName
	// `vendorName` shows up on customer cards that came in via a business-card
	// scan with the customer-as-vendor framing — fall back rather than reject.
	if (fields.vendorName) return fields.vendorName
	if (fields.email) {
		const local = fields.email.split("@")[0]
		if (local) return local
	}
	return undefined
}
