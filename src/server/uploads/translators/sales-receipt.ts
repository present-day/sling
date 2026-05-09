import "server-only"
import type { ExtractedFields } from "@/server/uploads/entity-kinds"
import { buildLines } from "./lines"
import {
	type SalesReceiptDraft,
	salesReceiptDraftSchema,
	TranslatorInputError,
} from "./types"

/**
 * Translate classifier-extracted fields into a SalesReceipt draft payload.
 *
 * SalesReceipt = a paid POS sale. CustomerRef is optional in QBO (you can file
 * to a generic walk-in customer), so we don't gate on it. The strict required
 * piece is at least one line item — see `buildLines` for the synthesis when
 * the classifier didn't break out lines.
 */
export function translateSalesReceipt(
	fields: ExtractedFields,
): SalesReceiptDraft {
	const Line = buildLines(fields)
	if (Line.length === 0) {
		throw new TranslatorInputError(
			["lines", "totalAmount"],
			"Sales receipt needs at least one line or a total amount.",
		)
	}

	const draft: SalesReceiptDraft = {
		Line,
		CustomerRef: fields.customerName
			? { name: fields.customerName }
			: undefined,
		TxnDate: fields.txnDate,
		DocNumber: fields.docNumber,
		PrivateNote: fields.memo,
		PaymentMethodRef: fields.paymentMethod
			? { name: fields.paymentMethod }
			: undefined,
		CurrencyRef: fields.currency ? { value: fields.currency } : undefined,
		TotalAmt: fields.totalAmount,
	}

	return salesReceiptDraftSchema.parse(draft)
}
