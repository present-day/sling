import "server-only"
import type { ExtractedFields } from "@/server/uploads/entity-kinds"
import { type BillDraft, billDraftSchema, TranslatorInputError } from "./types"

type Line = BillDraft["Line"][number]

/**
 * Translate classifier-extracted fields into a Bill draft payload.
 *
 * QBO Bill requires a VendorRef and at least one AccountBasedExpenseLine. We
 * leave AccountRef empty on synthesized lines — the review form collects it
 * before posting (auto-resolution against the chart of accounts lands later).
 */
export function translateBill(fields: ExtractedFields): BillDraft {
	const missing: string[] = []
	if (!fields.vendorName) missing.push("vendorName")
	const Line = buildExpenseLines(fields)
	if (Line.length === 0) missing.push("totalAmount")
	if (missing.length > 0) {
		throw new TranslatorInputError(
			missing,
			`Bill needs ${missing.join(" and ")}.`,
		)
	}

	const draft: BillDraft = {
		Line,
		VendorRef: { name: fields.vendorName },
		TxnDate: fields.txnDate,
		DueDate: fields.dueDate,
		DocNumber: fields.docNumber,
		PrivateNote: fields.memo,
		CurrencyRef: fields.currency ? { value: fields.currency } : undefined,
		TotalAmt: fields.totalAmount,
	}

	return billDraftSchema.parse(draft)
}

function buildExpenseLines(fields: ExtractedFields): Line[] {
	const fromClassifier: Line[] = (fields.lines ?? [])
		.map((l) => buildLine(l))
		.filter((l): l is Line => l !== null)

	if (fromClassifier.length > 0) return fromClassifier

	if (fields.totalAmount !== undefined) {
		return [
			{
				DetailType: "AccountBasedExpenseLineDetail",
				Amount: fields.totalAmount,
				Description: fields.memo ?? undefined,
			},
		]
	}

	return []
}

function buildLine(
	raw: NonNullable<ExtractedFields["lines"]>[number],
): Line | null {
	const amount =
		raw.amount !== undefined
			? raw.amount
			: raw.quantity !== undefined && raw.unitPrice !== undefined
				? raw.quantity * raw.unitPrice
				: undefined
	if (amount === undefined) return null
	return {
		DetailType: "AccountBasedExpenseLineDetail",
		Amount: amount,
		Description: raw.description,
		AccountBasedExpenseLineDetail: raw.account
			? { AccountRef: { name: raw.account } }
			: undefined,
	}
}
