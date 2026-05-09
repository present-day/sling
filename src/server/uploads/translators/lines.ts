import "server-only"
import type { ExtractedFields } from "@/server/uploads/entity-kinds"
import type { SalesReceiptDraft } from "./types"

type Line = SalesReceiptDraft["Line"][number]

/**
 * Convert the classifier's loose `lines[]` into QBO-shape `SalesItemLine` entries.
 *
 * If the classifier extracted no line items at all, fall back to a single line
 * carrying `totalAmount` plus the document `memo` as the line description so the
 * draft is still postable (QBO requires `Line` non-empty on Invoice/SalesReceipt/
 * Estimate). If neither is available, returns an empty array — the caller decides
 * how to surface that to the form.
 */
export function buildLines(fields: ExtractedFields): Line[] {
	const fromClassifier: Line[] = (fields.lines ?? [])
		.map((l) => buildLine(l))
		.filter((l): l is Line => l !== null)

	if (fromClassifier.length > 0) return fromClassifier

	if (fields.totalAmount !== undefined) {
		return [
			{
				DetailType: "SalesItemLineDetail",
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
		DetailType: "SalesItemLineDetail",
		Amount: amount,
		Description: raw.description,
		SalesItemLineDetail:
			raw.quantity !== undefined ||
			raw.unitPrice !== undefined ||
			raw.account !== undefined
				? {
						Qty: raw.quantity,
						UnitPrice: raw.unitPrice,
						ItemRef: raw.account ? { name: raw.account } : undefined,
					}
				: undefined,
	}
}
