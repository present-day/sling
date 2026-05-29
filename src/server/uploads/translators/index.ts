import "server-only"
import type { ExtractedFields } from "@/server/uploads/entity-kinds"
import { EntityKind } from "@/server/uploads/entity-kinds"
import { translateBill } from "./bill"
import { translateCustomer } from "./customer"
import { translateEstimate } from "./estimate"
import { translateInvoice } from "./invoice"
import { translateSalesReceipt } from "./sales-receipt"
import type {
	BillDraft,
	CustomerDraft,
	EstimateDraft,
	InvoiceDraft,
	SalesReceiptDraft,
	VendorDraft,
} from "./types"
import { translateVendor } from "./vendor"

export type DocumentDraft =
	| { kind: typeof EntityKind.salesReceipt; payload: SalesReceiptDraft }
	| { kind: typeof EntityKind.invoice; payload: InvoiceDraft }
	| { kind: typeof EntityKind.customer; payload: CustomerDraft }
	| { kind: typeof EntityKind.estimate; payload: EstimateDraft }
	| { kind: typeof EntityKind.bill; payload: BillDraft }
	| { kind: typeof EntityKind.vendor; payload: VendorDraft }

/**
 * @deprecated Use DocumentDraft. Kept temporarily so existing imports compile.
 */
export type SalesScopeDraft = DocumentDraft

/**
 * Translate a classifier-chosen entity kind + extracted fields into a draft
 * QBO payload ready for the review form. Returns null for kinds we don't yet
 * have a translator for (JournalEntry, Deposit, BillPayment, etc.).
 */
export function translateDocument(
	kind: string,
	fields: ExtractedFields,
): DocumentDraft | null {
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
		case EntityKind.bill:
			return { kind: EntityKind.bill, payload: translateBill(fields) }
		case EntityKind.vendor:
			return { kind: EntityKind.vendor, payload: translateVendor(fields) }
		default:
			return null
	}
}

/**
 * @deprecated Use translateDocument. Kept for back-compat with existing call
 * sites; the name no longer reflects the scope (Bill + Vendor are dispatched
 * here too now).
 */
export const translateSalesScope = translateDocument

export {
	type BillDraft,
	type CustomerDraft,
	type EstimateDraft,
	type InvoiceDraft,
	type SalesReceiptDraft,
	TranslatorInputError,
	type VendorDraft,
} from "./types"
export {
	translateBill,
	translateCustomer,
	translateEstimate,
	translateInvoice,
	translateSalesReceipt,
	translateVendor,
}
