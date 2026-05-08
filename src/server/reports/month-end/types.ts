import { z } from "zod"
import type { PnlLine } from "@/server/qbo/profit-and-loss"

export const findingSeveritySchema = z.enum(["info", "warn", "critical"])
export type FindingSeverity = z.infer<typeof findingSeveritySchema>

export const findingEvidenceSchema = z.object({
	rule: z.string(),
	thresholdLabel: z.string(),
	currentValue: z.number().nullable(),
	baselineValue: z.number().nullable(),
	absDelta: z.number().nullable(),
	pctDelta: z.number().nullable(),
})
export type FindingEvidence = z.infer<typeof findingEvidenceSchema>

export const findingSchema = z.object({
	id: z.string(),
	detector: z.string(),
	severity: findingSeveritySchema,
	title: z.string(),
	evidence: findingEvidenceSchema,
	affectedLinePaths: z.array(z.string()),
	suggestedAction: z.string(),
})
export type Finding = z.infer<typeof findingSchema>

export const narrativePayloadSchema = z.object({
	summary: z.string(),
	perFindingComments: z.record(z.string(), z.string()),
	modelVersion: z.string(),
	rawPrompt: z.string(),
	rawResponse: z.string(),
})
export type NarrativePayload = z.infer<typeof narrativePayloadSchema>

export type Baseline = {
	id: string
	label: string
	period: { start: string; end: string }
	lines: PnlLine[]
	columns: { title: string }[]
}

export type CloseInputSnapshot = {
	current: {
		period: { start: string; end: string }
		lines: PnlLine[]
		columns: { title: string }[]
		currency?: string
	}
	baselines: Baseline[]
}

export const closeInputSnapshotSchema = z
	.object({
		current: z.object({
			period: z.object({ start: z.string(), end: z.string() }),
			lines: z.array(z.unknown()),
			columns: z.array(z.unknown()),
			currency: z.string().optional(),
		}),
		baselines: z.array(z.unknown()),
	})
	.passthrough()
