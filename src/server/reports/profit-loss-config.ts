import { z } from "zod"

const dateRangeSchema = z.object({
	/** YYYY-MM-DD */
	from: z.string(),
	/** YYYY-MM-DD */
	to: z.string(),
})

export const profitLossTemplateConfigSchema = z.object({
	name: z.string(),
	kind: z.literal("profit_loss"),
	params: z.object({
		dateRange: z.union([dateRangeSchema, z.string()]),
		accountingMethod: z.enum(["cash", "accrual"]),
		summarizeColumnBy: z
			.enum(["Total", "Month", "Week", "Days", "Quarter", "Year"])
			.optional(),
	}),
	sections: z.array(
		z.discriminatedUnion("type", [
			z.object({
				type: z.literal("table"),
				source: z.literal("profit_and_loss"),
				title: z.string().optional(),
				columns: z.array(z.string()).optional(),
			}),
			z.object({
				type: z.literal("kpi_grid"),
				source: z.literal("profit_and_loss"),
				metrics: z.array(z.string()),
			}),
			z.object({
				type: z.literal("markdown"),
				content: z.string(),
			}),
		]),
	),
	branding: z
		.object({
			title: z.string().optional(),
			footer: z.string().optional(),
		})
		.optional(),
	metadata: z
		.object({
			extractedTextPreview: z.string().max(20_000).optional(),
		})
		.optional(),
})

export type ProfitLossTemplateConfig = z.infer<
	typeof profitLossTemplateConfigSchema
>

const today = new Date()
const endOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 0)
const startOfLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1)

function ymd(d: Date): string {
	return d.toISOString().slice(0, 10)
}

/** Used before any PDF upload or if parsing fails. */
export const defaultProfitLossTemplateConfig: ProfitLossTemplateConfig = {
	name: "Profit & Loss",
	kind: "profit_loss",
	params: {
		dateRange: { from: ymd(startOfLastMonth), to: ymd(endOfLastMonth) },
		accountingMethod: "accrual",
	},
	sections: [
		{
			type: "table",
			source: "profit_and_loss",
			title: "Profit and Loss",
			columns: [],
		},
	],
}

export function parseProfitLossConfig(
	input: unknown,
): ProfitLossTemplateConfig {
	const p = profitLossTemplateConfigSchema.safeParse(input)
	if (p.success) {
		return p.data
	}
	return defaultProfitLossTemplateConfig
}

/** Schema the LLM fills — slightly looser, then we coerce. */
export const llmProfitLossConfigSchema = z.object({
	name: z.string().optional(),
	params: z
		.object({
			accountingMethod: z.enum(["cash", "accrual"]).optional(),
			summarizeColumnBy: z
				.enum(["Total", "Month", "Week", "Days", "Quarter", "Year"])
				.optional(),
		})
		.optional(),
	sections: z
		.array(
			z.object({
				type: z.string(),
				title: z.string().optional(),
				columns: z.array(z.string()).optional(),
			}),
		)
		.optional(),
	branding: z
		.object({
			title: z.string().optional(),
			footer: z.string().optional(),
		})
		.optional(),
})

export function mergeLlmIntoProfitLossConfig(
	extractedTextHint: string,
	partial: z.infer<typeof llmProfitLossConfigSchema>,
): ProfitLossTemplateConfig {
	const d = defaultProfitLossTemplateConfig
	const from = partial.branding?.title?.length ? partial.branding.title : d.name
	return profitLossTemplateConfigSchema.parse({
		name: partial.name?.trim() || from,
		kind: "profit_loss",
		params: {
			dateRange: d.params.dateRange,
			accountingMethod:
				partial.params?.accountingMethod ?? d.params.accountingMethod,
			summarizeColumnBy: partial.params?.summarizeColumnBy,
		},
		sections: partial.sections?.length
			? partial.sections.map((s) => {
					const t = s.type.toLowerCase()
					if (t === "kpi" || t === "kpi_grid") {
						return {
							type: "kpi_grid" as const,
							source: "profit_and_loss" as const,
							metrics: s.columns?.length
								? s.columns
								: ["Total income", "Gross profit", "Net income"],
						}
					}
					return {
						type: "table" as const,
						source: "profit_and_loss" as const,
						title: s.title,
						columns: s.columns,
					}
				})
			: d.sections,
		branding: {
			...partial.branding,
		},
		metadata: { extractedTextPreview: extractedTextHint.slice(0, 2000) },
	})
}
