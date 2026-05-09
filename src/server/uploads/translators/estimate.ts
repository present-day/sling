import "server-only"
import type { ExtractedFields } from "@/server/uploads/entity-kinds"
import { buildLines } from "./lines"
import {
	type EstimateDraft,
	estimateDraftSchema,
	TranslatorInputError,
} from "./types"

/**
 * Translate classifier-extracted fields into an Estimate draft payload.
 *
 * Estimate = a quote/proposal to a customer. CustomerRef is optional in QBO
 * (estimates can be filed against a placeholder for not-yet-onboarded leads).
 * Like SalesReceipt, the only hard requirement is at least one line item.
 */
export function translateEstimate(fields: ExtractedFields): EstimateDraft {
	const Line = buildLines(fields)
	if (Line.length === 0) {
		throw new TranslatorInputError(
			["lines", "totalAmount"],
			"Estimate needs at least one line or a total amount.",
		)
	}

	const draft: EstimateDraft = {
		Line,
		CustomerRef: fields.customerName
			? { name: fields.customerName }
			: undefined,
		TxnDate: fields.txnDate,
		ExpirationDate: fields.dueDate,
		DocNumber: fields.docNumber,
		PrivateNote: fields.memo,
		TotalAmt: fields.totalAmount,
	}

	return estimateDraftSchema.parse(draft)
}
