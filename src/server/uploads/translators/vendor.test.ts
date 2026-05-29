import { describe, expect, it } from "vitest"
import { TranslatorInputError } from "./types"
import { translateVendor } from "./vendor"

describe("translateVendor", () => {
	it("turns a vendor card scan into a Vendor draft", () => {
		const draft = translateVendor({
			vendorName: "Acme Office Supply",
			email: "ap@acme.test",
			phone: "555-0100",
			address: "123 Main St, Springfield",
		})
		expect(draft.DisplayName).toBe("Acme Office Supply")
		expect(draft.CompanyName).toBe("Acme Office Supply")
		expect(draft.PrimaryEmailAddr).toEqual({ Address: "ap@acme.test" })
		expect(draft.PrimaryPhone).toEqual({ FreeFormNumber: "555-0100" })
		expect(draft.BillAddr).toEqual({ Line1: "123 Main St, Springfield" })
	})

	it("falls back to customerName when vendorName is absent", () => {
		const draft = translateVendor({ customerName: "Beta LLC" })
		expect(draft.DisplayName).toBe("Beta LLC")
	})

	it("falls back to the email local-part", () => {
		const draft = translateVendor({ email: "billing@gamma.test" })
		expect(draft.DisplayName).toBe("billing")
	})

	it("throws when no usable name source is present", () => {
		expect(() => translateVendor({ phone: "555-0100" })).toThrowError(
			TranslatorInputError,
		)
	})
})
