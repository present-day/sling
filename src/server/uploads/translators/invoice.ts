import "server-only"
import type { ExtractedFields } from "@/server/uploads/entity-kinds"
import { buildLines } from "./lines"
import {
	type InvoiceDraft,
	invoiceDraftSchema,
	TranslatorInputError,
} from "./types"

/**
 * Translate classifier-extracted fields into an Invoice draft payload.
 *
 * Invoice = a billed-to-customer sale (A/R). Unlike SalesReceipt, QBO requires
 * a CustomerRef. If the classifier didn't pull a customer name, throw — the
 * wizard form has to collect it before posting.
 */
export function translateInvoice(fields: ExtractedFields): InvoiceDraft {
	const missing: string[] = []
	const Line = buildLines(fields)
	if (Line.length === 0) missing.push("lines", "totalAmount")
	if (!fields.customerName) missing.push("customerName")
	if (missing.length > 0) {
		throw new TranslatorInputError(
			missing,
			`Invoice needs ${missing.join(", ")} before it can be drafted.`,
		)
	}

	const draft: InvoiceDraft = {
		Line,
		CustomerRef: { name: fields.customerName as string },
		TxnDate: fields.txnDate,
		DueDate: fields.dueDate,
		DocNumber: fields.docNumber,
		PrivateNote: fields.memo,
		CurrencyRef: fields.currency ? { value: fields.currency } : undefined,
		TotalAmt: fields.totalAmount,
	}

	return invoiceDraftSchema.parse(draft)
}
