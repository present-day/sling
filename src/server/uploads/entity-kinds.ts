import "server-only"
import { z } from "zod"

/**
 * The QuickBooks entity targets the document classifier can route an upload
 * to. Kept narrower than the full QB API surface — covers only the kinds a
 * bookkeeper would realistically file from a dropped document.
 */
export const EntityKind = {
	bill: "Bill",
	invoice: "Invoice",
	salesReceipt: "SalesReceipt",
	creditMemo: "CreditMemo",
	refundReceipt: "RefundReceipt",
	payment: "Payment",
	billPayment: "BillPayment",
	deposit: "Deposit",
	estimate: "Estimate",
	purchaseOrder: "PurchaseOrder",
	vendorCredit: "VendorCredit",
	journalEntry: "JournalEntry",
	vendor: "Vendor",
	customer: "Customer",
} as const

export type EntityKind = (typeof EntityKind)[keyof typeof EntityKind]

export const ENTITY_KIND_VALUES: readonly EntityKind[] =
	Object.values(EntityKind)

export const ENTITY_KIND_DESCRIPTIONS: Record<EntityKind, string> = {
	Bill: "A vendor invoice you owe — accounts-payable bill from a supplier (utilities, rent, materials, services). Look for a vendor letterhead, a 'Bill To: <your company>' block, an amount-due/totals line, and a due date. Not a customer invoice.",
	Invoice:
		"A sale to a customer, billed for later payment. Look for an invoice number, customer name in 'Bill To:', line items, terms (Net 30, etc.), and an outstanding balance.",
	SalesReceipt:
		"A point-of-sale cash sale that's already paid — typically a customer receipt or POS slip. Smaller, no payment terms, often shows tendered amount.",
	CreditMemo:
		"A credit issued to a customer (refund-as-credit, return). Negative-leaning amounts, references an original invoice.",
	RefundReceipt:
		"A cash refund issued to a customer (money out the door). Distinct from a CreditMemo by the actual refund of funds.",
	Payment:
		"A payment received from a customer applied to one or more invoices. Typically a remittance advice or bank-transfer notification.",
	BillPayment:
		"A payment you made to a vendor against one or more bills. Check stub, ACH advice, wire confirmation.",
	Deposit:
		"A bank deposit slip or batched deposit detail (often combining customer payments + other inflows).",
	Estimate:
		"A quote or estimate to a customer (not yet billed). Look for words like Estimate, Quote, Proposal.",
	PurchaseOrder:
		"A purchase order issued to a vendor (commitment to buy, not yet billed).",
	VendorCredit:
		"A credit memo received from a vendor (return, refund-as-credit, allowance). Reduces a bill or future bill.",
	JournalEntry:
		"A general-ledger journal entry — debits and credits across accounts, often for adjustments, accruals, or corrections.",
	Vendor:
		"A new vendor card / W-9 / contact sheet. No transactional amounts; just identity and contact details.",
	Customer:
		"A new customer card / contact sheet / onboarding form. No transactional amounts; just identity, billing/shipping addresses, terms.",
}

const lineItemSchema = z
	.object({
		description: z.string().optional(),
		quantity: z.number().optional(),
		unitPrice: z.number().optional(),
		amount: z.number().optional(),
		account: z.string().optional(),
	})
	.partial()

/**
 * Loose, entity-agnostic field shape the classifier extracts. Each downstream
 * translator (#11/#12) refines to the real QB payload; this schema's only job
 * is to give the wizard form enough to pre-fill against.
 */
export const extractedFieldsSchema = z
	.object({
		txnDate: z.string().optional(),
		dueDate: z.string().optional(),
		docNumber: z.string().optional(),
		totalAmount: z.number().optional(),
		taxAmount: z.number().optional(),
		currency: z.string().optional(),
		vendorName: z.string().optional(),
		customerName: z.string().optional(),
		paymentMethod: z.string().optional(),
		appliedToDocNumbers: z.array(z.string()).optional(),
		lines: z.array(lineItemSchema).optional(),
		memo: z.string().optional(),
		address: z.string().optional(),
		email: z.string().optional(),
		phone: z.string().optional(),
	})
	.partial()

export type ExtractedFields = z.infer<typeof extractedFieldsSchema>

// Anthropic's structured-output JSON Schema subset doesn't accept
// minItems/maxItems on arrays or min/max on numbers, so we omit those
// constraints from the schema sent to the model and enforce them via prompt +
// post-validation instead. clampClassification() handles the post-trim.
export const candidateSchema = z.object({
	entityKind: z.enum(ENTITY_KIND_VALUES as [EntityKind, ...EntityKind[]]),
	confidence: z.number(),
	extractedFields: extractedFieldsSchema,
	reasoning: z.string(),
})

export type Candidate = z.infer<typeof candidateSchema>

export const classificationSchema = z.object({
	candidates: z.array(candidateSchema),
	notes: z.string().optional(),
})

export type Classification = z.infer<typeof classificationSchema>

export const MAX_CANDIDATES = 3

/**
 * Trim the model output to our enforced shape: at most MAX_CANDIDATES, all
 * confidences clamped to [0, 1]. Throws if the model returned no candidates.
 */
export function clampClassification(raw: Classification): Classification {
	if (raw.candidates.length === 0) {
		throw new Error("Classifier returned no candidates")
	}
	return {
		...raw,
		candidates: raw.candidates.slice(0, MAX_CANDIDATES).map((c) => ({
			...c,
			confidence: Math.max(0, Math.min(1, c.confidence)),
		})),
	}
}
