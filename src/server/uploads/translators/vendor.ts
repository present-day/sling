import "server-only"
import type { ExtractedFields } from "@/server/uploads/entity-kinds"
import {
	TranslatorInputError,
	type VendorDraft,
	vendorDraftSchema,
} from "./types"

/**
 * Translate classifier-extracted fields into a Vendor draft payload.
 *
 * QBO requires `DisplayName` (unique within the realm). Prefer `vendorName`,
 * fall back to `customerName` for cards that came in via business-card scans,
 * then the email local-part. Throw if none of those are present.
 */
export function translateVendor(fields: ExtractedFields): VendorDraft {
	const displayName = pickDisplayName(fields)
	if (!displayName) {
		throw new TranslatorInputError(
			["displayName"],
			"Vendor needs a display name (vendorName, customerName, or email).",
		)
	}

	const draft: VendorDraft = {
		DisplayName: displayName,
		CompanyName: fields.vendorName ?? fields.customerName,
		PrimaryEmailAddr: fields.email ? { Address: fields.email } : undefined,
		PrimaryPhone: fields.phone ? { FreeFormNumber: fields.phone } : undefined,
		BillAddr: fields.address ? { Line1: fields.address } : undefined,
	}

	return vendorDraftSchema.parse(draft)
}

function pickDisplayName(fields: ExtractedFields): string | undefined {
	if (fields.vendorName) return fields.vendorName
	if (fields.customerName) return fields.customerName
	if (fields.email) {
		const local = fields.email.split("@")[0]
		if (local) return local
	}
	return undefined
}
