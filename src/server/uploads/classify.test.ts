import { describe, expect, it, vi } from "vitest"
import {
	classifyDocument,
	FileTooLargeError,
	isSupportedMime,
	UnsupportedMimeError,
} from "./classify"
import { clampClassification, classificationSchema } from "./entity-kinds"

function fakeGenerate(payload: unknown) {
	const text = `\`\`\`json\n${JSON.stringify(payload)}\n\`\`\``
	return vi.fn().mockResolvedValue({
		text,
		content: [{ type: "text", text }],
		usage: {},
		finishReason: "stop",
		warnings: [],
	})
}

describe("isSupportedMime", () => {
	it.each([
		["application/pdf", true],
		["image/png", true],
		["image/jpeg", true],
		["image/heic", true],
		["text/csv", true],
		["application/vnd.ms-excel", true],
		["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", true],
		["application/zip", false],
		["text/plain", false],
		["video/mp4", false],
	])("%s → %s", (mime, expected) => {
		expect(isSupportedMime(mime)).toBe(expected)
	})
})

describe("classifyDocument", () => {
	const apiKey = "test-key"

	it("rejects unsupported mime types without calling the model", async () => {
		const generate = fakeGenerate({})
		await expect(
			classifyDocument(
				{
					bytes: Buffer.from("hello"),
					mime: "application/zip",
					fileName: "hi.zip",
				},
				{ apiKey, generate: generate as never },
			),
		).rejects.toBeInstanceOf(UnsupportedMimeError)
		expect(generate).not.toHaveBeenCalled()
	})

	it("rejects oversized payloads without calling the model", async () => {
		const generate = fakeGenerate({})
		const big = Buffer.alloc(26 * 1024 * 1024)
		await expect(
			classifyDocument(
				{ bytes: big, mime: "application/pdf", fileName: "big.pdf" },
				{ apiKey, generate: generate as never },
			),
		).rejects.toBeInstanceOf(FileTooLargeError)
		expect(generate).not.toHaveBeenCalled()
	})

	it("classifies a vendor-bill PDF as Bill", async () => {
		const expected = {
			candidates: [
				{
					entityKind: "Bill" as const,
					confidence: 0.92,
					extractedFields: {
						vendorName: "Acme Supply",
						txnDate: "2026-04-15",
						dueDate: "2026-05-15",
						docNumber: "INV-9001",
						totalAmount: 1284.5,
						currency: "USD",
						lines: [
							{ description: "Bulk paper, 20 boxes", amount: 1200 },
							{ description: "Shipping", amount: 84.5 },
						],
					},
					reasoning:
						"Vendor letterhead with 'Bill To: <our company>' and Net 30 terms.",
				},
			],
		}
		const generate = fakeGenerate(expected)
		const result = await classifyDocument(
			{
				bytes: Buffer.from("%PDF-1.4 fake bytes"),
				mime: "application/pdf",
				fileName: "acme-bill.pdf",
			},
			{ apiKey, generate: generate as never },
		)

		expect(generate).toHaveBeenCalledOnce()
		const call = generate.mock.calls[0]?.[0] as {
			messages: { content: unknown[] }[]
		}
		const block = (call.messages[0]?.content as Array<{ type: string }>).find(
			(b) => b.type === "file",
		) as { type: "file"; mediaType: string; filename: string } | undefined
		expect(block?.mediaType).toBe("application/pdf")
		expect(block?.filename).toBe("acme-bill.pdf")

		const parsed = classificationSchema.parse(result)
		expect(parsed.candidates[0]?.entityKind).toBe("Bill")
		expect(parsed.candidates[0]?.extractedFields.vendorName).toBe("Acme Supply")
		expect(parsed.candidates[0]?.extractedFields.totalAmount).toBeCloseTo(
			1284.5,
		)
	})

	it("classifies a coffee-shop receipt image as SalesReceipt", async () => {
		const expected = {
			candidates: [
				{
					entityKind: "SalesReceipt" as const,
					confidence: 0.84,
					extractedFields: {
						vendorName: "Blue Bottle",
						txnDate: "2026-04-20",
						totalAmount: 6.5,
						paymentMethod: "Visa **** 4242",
					},
					reasoning: "POS receipt, single tendered amount, no customer terms.",
				},
				{
					entityKind: "Bill" as const,
					confidence: 0.12,
					extractedFields: { vendorName: "Blue Bottle", totalAmount: 6.5 },
					reasoning: "Could be filed as a Bill if expensed for reimbursement.",
				},
			],
		}
		const generate = fakeGenerate(expected)
		const result = await classifyDocument(
			{
				bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
				mime: "image/png",
				fileName: "receipt.png",
			},
			{ apiKey, generate: generate as never },
		)

		const call = generate.mock.calls[0]?.[0] as {
			messages: { content: unknown[] }[]
		}
		const block = (call.messages[0]?.content as Array<{ type: string }>).find(
			(b) => b.type === "image",
		) as { type: "image"; mediaType: string } | undefined
		expect(block?.mediaType).toBe("image/png")

		const parsed = classificationSchema.parse(result)
		expect(parsed.candidates).toHaveLength(2)
		expect(parsed.candidates[0]?.entityKind).toBe("SalesReceipt")
		expect(parsed.candidates[0]?.confidence).toBeGreaterThan(
			parsed.candidates[1]?.confidence ?? 1,
		)
	})

	it("flattens a CSV into a text block before sending", async () => {
		const csv =
			"Date,Description,Amount\n2026-04-01,Coffee,4.50\n2026-04-02,Rent,2000.00\n"
		const expected = {
			candidates: [
				{
					entityKind: "JournalEntry" as const,
					confidence: 0.55,
					extractedFields: {
						lines: [
							{ description: "Coffee", amount: 4.5 },
							{ description: "Rent", amount: 2000 },
						],
					},
					reasoning: "Two-row table with Date/Description/Amount columns.",
				},
			],
		}
		const generate = fakeGenerate(expected)
		await classifyDocument(
			{
				bytes: Buffer.from(csv, "utf8"),
				mime: "text/csv",
				fileName: "ledger.csv",
			},
			{ apiKey, generate: generate as never },
		)

		const call = generate.mock.calls[0]?.[0] as {
			messages: { content: unknown[] }[]
		}
		const text = (
			call.messages[0]?.content as Array<{ type: string; text?: string }>
		).find((b) => b.type === "text" && b.text?.includes("Parsed table"))?.text
		expect(text).toContain("2026-04-02,Rent,2000.00")
	})

	it("schema rejects unknown entity kinds", () => {
		expect(() =>
			classificationSchema.parse({
				candidates: [
					{
						entityKind: "NotARealKind",
						confidence: 0.9,
						extractedFields: {},
						reasoning: "test",
					},
				],
			}),
		).toThrow()
	})

	it("clampClassification trims to MAX_CANDIDATES and clamps confidence", () => {
		const tooMany = {
			candidates: [
				{
					entityKind: "Bill" as const,
					confidence: 1.5,
					extractedFields: {},
					reasoning: "a",
				},
				{
					entityKind: "Invoice" as const,
					confidence: 0.5,
					extractedFields: {},
					reasoning: "b",
				},
				{
					entityKind: "SalesReceipt" as const,
					confidence: 0.4,
					extractedFields: {},
					reasoning: "c",
				},
				{
					entityKind: "Vendor" as const,
					confidence: -0.2,
					extractedFields: {},
					reasoning: "d",
				},
			],
		}
		const clamped = clampClassification(tooMany)
		expect(clamped.candidates).toHaveLength(3)
		expect(clamped.candidates[0]?.confidence).toBe(1)
		expect(clamped.candidates.some((c) => c.entityKind === "Vendor")).toBe(
			false,
		)
	})

	it("clampClassification throws on empty candidates", () => {
		expect(() => clampClassification({ candidates: [] })).toThrow()
	})
})
