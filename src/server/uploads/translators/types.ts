// No `server-only` directive: these Zod schemas + Error class are shared
// validation primitives used by both the server translators and the client
// review form. Keep them client-safe.
import { z } from "zod"

/**
 * Schemas for the QuickBooks Online v3 entity payloads our translators
 * produce. They're "draft" shapes: refs carry only a `name` (the value/QB id
 * is resolved downstream by the entity-search layer), and only the absolute
 * minimum required fields are non-optional. The downstream tRPC mutations
 * (still TBD per issue #11/#12) will tighten these schemas before posting to
 * Intuit.
 */

const refSchema = z
	.object({
		value: z.string().optional(),
		name: z.string().optional(),
	})
	.partial()

const salesItemLineSchema = z.object({
	DetailType: z.literal("SalesItemLineDetail"),
	Amount: z.number(),
	Description: z.string().optional(),
	SalesItemLineDetail: z
		.object({
			ItemRef: refSchema.optional(),
			Qty: z.number().optional(),
			UnitPrice: z.number().optional(),
		})
		.partial()
		.optional(),
})

export const salesReceiptDraftSchema = z.object({
	Line: z.array(salesItemLineSchema).min(1),
	CustomerRef: refSchema.optional(),
	TxnDate: z.string().optional(),
	DocNumber: z.string().optional(),
	PrivateNote: z.string().optional(),
	PaymentMethodRef: refSchema.optional(),
	PaymentRefNum: z.string().optional(),
	CurrencyRef: refSchema.optional(),
	TotalAmt: z.number().optional(),
})
export type SalesReceiptDraft = z.infer<typeof salesReceiptDraftSchema>

export const invoiceDraftSchema = z.object({
	Line: z.array(salesItemLineSchema).min(1),
	CustomerRef: refSchema,
	TxnDate: z.string().optional(),
	DueDate: z.string().optional(),
	DocNumber: z.string().optional(),
	PrivateNote: z.string().optional(),
	CurrencyRef: refSchema.optional(),
	TotalAmt: z.number().optional(),
})
export type InvoiceDraft = z.infer<typeof invoiceDraftSchema>

export const customerDraftSchema = z.object({
	DisplayName: z.string().min(1),
	CompanyName: z.string().optional(),
	GivenName: z.string().optional(),
	FamilyName: z.string().optional(),
	PrimaryEmailAddr: z
		.object({
			Address: z.string(),
		})
		.optional(),
	PrimaryPhone: z
		.object({
			FreeFormNumber: z.string(),
		})
		.optional(),
	BillAddr: z
		.object({
			Line1: z.string().optional(),
			City: z.string().optional(),
			CountrySubDivisionCode: z.string().optional(),
			PostalCode: z.string().optional(),
		})
		.partial()
		.optional(),
	Notes: z.string().optional(),
})
export type CustomerDraft = z.infer<typeof customerDraftSchema>

const accountBasedExpenseLineSchema = z.object({
	DetailType: z.literal("AccountBasedExpenseLineDetail"),
	Amount: z.number(),
	Description: z.string().optional(),
	AccountBasedExpenseLineDetail: z
		.object({
			AccountRef: refSchema.optional(),
		})
		.partial()
		.optional(),
})

export const billDraftSchema = z.object({
	Line: z.array(accountBasedExpenseLineSchema).min(1),
	VendorRef: refSchema,
	TxnDate: z.string().optional(),
	DueDate: z.string().optional(),
	DocNumber: z.string().optional(),
	PrivateNote: z.string().optional(),
	CurrencyRef: refSchema.optional(),
	TotalAmt: z.number().optional(),
})
export type BillDraft = z.infer<typeof billDraftSchema>

export const vendorDraftSchema = z.object({
	DisplayName: z.string().min(1),
	CompanyName: z.string().optional(),
	GivenName: z.string().optional(),
	FamilyName: z.string().optional(),
	PrimaryEmailAddr: z
		.object({
			Address: z.string(),
		})
		.optional(),
	PrimaryPhone: z
		.object({
			FreeFormNumber: z.string(),
		})
		.optional(),
	BillAddr: z
		.object({
			Line1: z.string().optional(),
			City: z.string().optional(),
			CountrySubDivisionCode: z.string().optional(),
			PostalCode: z.string().optional(),
		})
		.partial()
		.optional(),
})
export type VendorDraft = z.infer<typeof vendorDraftSchema>

export const estimateDraftSchema = z.object({
	Line: z.array(salesItemLineSchema).min(1),
	CustomerRef: refSchema.optional(),
	TxnDate: z.string().optional(),
	ExpirationDate: z.string().optional(),
	DocNumber: z.string().optional(),
	PrivateNote: z.string().optional(),
	TotalAmt: z.number().optional(),
})
export type EstimateDraft = z.infer<typeof estimateDraftSchema>

/**
 * Thrown when the classifier didn't extract enough to produce even a draft
 * payload — the wizard form has to collect the missing pieces from the user
 * before this entity can be drafted.
 */
export class TranslatorInputError extends Error {
	constructor(
		public readonly missing: readonly string[],
		message?: string,
	) {
		super(message ?? `Cannot draft entity — missing: ${missing.join(", ")}`)
		this.name = "TranslatorInputError"
	}
}
