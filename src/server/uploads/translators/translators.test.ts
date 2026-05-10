import { describe, expect, it } from "vitest"
import { EntityKind, type ExtractedFields } from "@/server/uploads/entity-kinds"
import {
	translateCustomer,
	translateEstimate,
	translateInvoice,
	translateSalesReceipt,
	translateSalesScope,
} from "./index"
import { TranslatorInputError } from "./types"

describe("translateSalesReceipt", () => {
	it("turns a paid POS receipt into a SalesReceipt draft", () => {
		const fields: ExtractedFields = {
			txnDate: "2026-04-15",
			docNumber: "POS-7732",
			totalAmount: 48.5,
			currency: "USD",
			paymentMethod: "Visa",
			customerName: "Walk-in",
			memo: "Coffee + pastries",
			lines: [
				{ description: "Drip coffee", quantity: 2, unitPrice: 4.5, amount: 9 },
				{ description: "Almond croissant", amount: 39.5 },
			],
		}

		const draft = translateSalesReceipt(fields)

		expect(draft.TxnDate).toBe("2026-04-15")
		expect(draft.DocNumber).toBe("POS-7732")
		expect(draft.TotalAmt).toBe(48.5)
		expect(draft.PaymentMethodRef).toEqual({ name: "Visa" })
		expect(draft.CustomerRef).toEqual({ name: "Walk-in" })
		expect(draft.PrivateNote).toBe("Coffee + pastries")
		expect(draft.Line).toHaveLength(2)
		expect(draft.Line[0]).toMatchObject({
			DetailType: "SalesItemLineDetail",
			Amount: 9,
			Description: "Drip coffee",
			SalesItemLineDetail: { Qty: 2, UnitPrice: 4.5 },
		})
	})

	it("synthesizes a single-line draft from totalAmount when classifier didn't break out lines", () => {
		const draft = translateSalesReceipt({
			totalAmount: 24,
			currency: "USD",
			memo: "tip jar",
		})
		expect(draft.Line).toHaveLength(1)
		expect(draft.Line[0]).toEqual({
			DetailType: "SalesItemLineDetail",
			Amount: 24,
			Description: "tip jar",
		})
	})

	it("throws TranslatorInputError when there's no line and no total", () => {
		expect(() => translateSalesReceipt({ memo: "blank" })).toThrowError(
			TranslatorInputError,
		)
	})
})

describe("translateInvoice", () => {
	it("requires customerName to draft an invoice", () => {
		expect(() =>
			translateInvoice({ totalAmount: 100, customerName: undefined }),
		).toThrowError(TranslatorInputError)
	})

	it("produces an Invoice draft with CustomerRef and DueDate", () => {
		const fields: ExtractedFields = {
			customerName: "Wayne Enterprises",
			txnDate: "2026-04-30",
			dueDate: "2026-05-30",
			docNumber: "INV-2026-014",
			totalAmount: 12500,
			currency: "USD",
			memo: "Q2 retainer",
			lines: [
				{ description: "April retainer", amount: 6250 },
				{ description: "May retainer", amount: 6250 },
			],
		}

		const draft = translateInvoice(fields)

		expect(draft.CustomerRef).toEqual({ name: "Wayne Enterprises" })
		expect(draft.DueDate).toBe("2026-05-30")
		expect(draft.DocNumber).toBe("INV-2026-014")
		expect(draft.TotalAmt).toBe(12500)
		expect(draft.Line).toHaveLength(2)
		expect(draft.PrivateNote).toBe("Q2 retainer")
	})
})

describe("translateCustomer", () => {
	it("turns a contact card into a Customer draft", () => {
		const fields: ExtractedFields = {
			customerName: "Pam Beesly",
			email: "pam@dundermifflin.com",
			phone: "+1-555-0102",
			address: "1725 Slough Ave, Scranton, PA 18505",
		}

		const draft = translateCustomer(fields)

		expect(draft.DisplayName).toBe("Pam Beesly")
		expect(draft.PrimaryEmailAddr).toEqual({ Address: "pam@dundermifflin.com" })
		expect(draft.PrimaryPhone).toEqual({ FreeFormNumber: "+1-555-0102" })
		expect(draft.BillAddr).toEqual({
			Line1: "1725 Slough Ave, Scranton, PA 18505",
		})
	})

	it("falls back to the email local-part when no name is extracted", () => {
		const draft = translateCustomer({ email: "leads@acme.com" })
		expect(draft.DisplayName).toBe("leads")
	})

	it("throws when nothing usable is extracted", () => {
		expect(() => translateCustomer({ memo: "nothing here" })).toThrowError(
			TranslatorInputError,
		)
	})
})

describe("translateEstimate", () => {
	it("turns a quote into an Estimate draft with ExpirationDate", () => {
		const fields: ExtractedFields = {
			customerName: "Northwind Co.",
			txnDate: "2026-05-01",
			dueDate: "2026-05-31",
			docNumber: "EST-014",
			totalAmount: 8200,
			lines: [
				{ description: "Discovery phase", amount: 3200 },
				{ description: "Implementation phase", amount: 5000 },
			],
			memo: "Net 15 once accepted",
		}

		const draft = translateEstimate(fields)

		expect(draft.CustomerRef).toEqual({ name: "Northwind Co." })
		expect(draft.ExpirationDate).toBe("2026-05-31")
		expect(draft.DocNumber).toBe("EST-014")
		expect(draft.TotalAmt).toBe(8200)
		expect(draft.Line).toHaveLength(2)
	})
})

describe("translateSalesScope (entry point)", () => {
	it("dispatches by entity kind and returns null for non-sales kinds", () => {
		const fields: ExtractedFields = { totalAmount: 50, customerName: "X" }

		expect(translateSalesScope(EntityKind.salesReceipt, fields)?.kind).toBe(
			EntityKind.salesReceipt,
		)
		expect(translateSalesScope(EntityKind.invoice, fields)?.kind).toBe(
			EntityKind.invoice,
		)
		expect(
			translateSalesScope(EntityKind.customer, { customerName: "X" })?.kind,
		).toBe(EntityKind.customer)
		expect(translateSalesScope(EntityKind.estimate, fields)?.kind).toBe(
			EntityKind.estimate,
		)
		expect(translateSalesScope(EntityKind.bill, fields)).toBeNull()
		expect(translateSalesScope(EntityKind.deposit, fields)).toBeNull()
	})
})
