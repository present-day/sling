import { describe, expect, it } from "vitest"
import type { ExtractedFields } from "@/server/uploads/entity-kinds"
import { translateBill } from "./bill"
import { TranslatorInputError } from "./types"

describe("translateBill", () => {
	it("turns a vendor receipt into a Bill draft", () => {
		const fields: ExtractedFields = {
			txnDate: "2026-04-15",
			dueDate: "2026-05-15",
			docNumber: "INV-555",
			totalAmount: 142.3,
			currency: "USD",
			vendorName: "Acme Office Supply",
			memo: "Toner + paper",
			lines: [
				{ description: "Toner cartridge", amount: 89.99, account: "Supplies" },
				{ description: "Letter paper", quantity: 2, unitPrice: 26.155 },
			],
		}

		const draft = translateBill(fields)

		expect(draft.VendorRef).toEqual({ name: "Acme Office Supply" })
		expect(draft.TxnDate).toBe("2026-04-15")
		expect(draft.DueDate).toBe("2026-05-15")
		expect(draft.DocNumber).toBe("INV-555")
		expect(draft.PrivateNote).toBe("Toner + paper")
		expect(draft.TotalAmt).toBe(142.3)
		expect(draft.Line).toHaveLength(2)
		expect(draft.Line[0]).toMatchObject({
			DetailType: "AccountBasedExpenseLineDetail",
			Amount: 89.99,
			Description: "Toner cartridge",
			AccountBasedExpenseLineDetail: { AccountRef: { name: "Supplies" } },
		})
		expect(draft.Line[1].Amount).toBeCloseTo(52.31, 2)
	})

	it("synthesizes a single-line draft from totalAmount", () => {
		const draft = translateBill({
			vendorName: "Coffee Co",
			totalAmount: 24,
			memo: "monthly subscription",
		})
		expect(draft.Line).toHaveLength(1)
		expect(draft.Line[0]).toEqual({
			DetailType: "AccountBasedExpenseLineDetail",
			Amount: 24,
			Description: "monthly subscription",
		})
	})

	it("throws when vendorName is missing", () => {
		expect(() => translateBill({ totalAmount: 10 })).toThrowError(
			TranslatorInputError,
		)
	})

	it("throws when there's no line and no total", () => {
		expect(() => translateBill({ vendorName: "Acme" })).toThrowError(
			TranslatorInputError,
		)
	})

	it("collects both missing fields when nothing is provided", () => {
		try {
			translateBill({})
			throw new Error("expected throw")
		} catch (e) {
			expect(e).toBeInstanceOf(TranslatorInputError)
			expect((e as TranslatorInputError).missing).toEqual([
				"vendorName",
				"totalAmount",
			])
		}
	})
})
