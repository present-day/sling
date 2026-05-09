import "server-only"
import type { ExtractedFields } from "@/server/uploads/entity-kinds"
import { EntityKind } from "@/server/uploads/entity-kinds"
import { translateCustomer } from "./customer"
import { translateEstimate } from "./estimate"
import { translateInvoice } from "./invoice"
import { translateSalesReceipt } from "./sales-receipt"
import type {
	CustomerDraft,
	EstimateDraft,
	InvoiceDraft,
	SalesReceiptDraft,
} from "./types"

export type SalesScopeDraft =
	| { kind: typeof EntityKind.salesReceipt; payload: SalesReceiptDraft }
	| { kind: typeof EntityKind.invoice; payload: InvoiceDraft }
	| { kind: typeof EntityKind.customer; payload: CustomerDraft }
	| { kind: typeof EntityKind.estimate; payload: EstimateDraft }

/**
 * Sales-scope (#11) entry point — given a classifier-chosen entity kind
 * and the extracted fields, produce a draft payload ready for the wizard form
 * to refine and (eventually) post via tRPC.
 *
 * Returns `null` for entity kinds outside the Sales scope; the Purchases /
 * Banking translators in #12 handle Bill / VendorCredit / Deposit / etc.
 */
export function translateSalesScope(
	kind: string,
	fields: ExtractedFields,
): SalesScopeDraft | null {
	switch (kind) {
		case EntityKind.salesReceipt:
			return {
				kind: EntityKind.salesReceipt,
				payload: translateSalesReceipt(fields),
			}
		case EntityKind.invoice:
			return { kind: EntityKind.invoice, payload: translateInvoice(fields) }
		case EntityKind.customer:
			return { kind: EntityKind.customer, payload: translateCustomer(fields) }
		case EntityKind.estimate:
			return { kind: EntityKind.estimate, payload: translateEstimate(fields) }
		default:
			return null
	}
}

export {
	type CustomerDraft,
	type EstimateDraft,
	type InvoiceDraft,
	type SalesReceiptDraft,
	TranslatorInputError,
} from "./types"
export {
	translateCustomer,
	translateEstimate,
	translateInvoice,
	translateSalesReceipt,
}
