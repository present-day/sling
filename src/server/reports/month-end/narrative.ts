import "server-only";

import { createAnthropic } from "@ai-sdk/anthropic";
import { generateObject } from "ai";
import { z } from "zod";
import { getEnv } from "@/lib/env";
import type { Finding, NarrativePayload } from "./types";
import type { BucketTotals } from "./variance";

const MODEL = "claude-sonnet-4-20250514" as const;

const llmNarrativeSchema = z.object({
	summary: z.string(),
	perFindingComments: z.record(z.string(), z.string()),
});

export type NarrativeInputs = {
	period: { start: string; end: string };
	accountingMethod: "Accrual" | "Cash";
	baselineLabel: string;
	totals: { current: BucketTotals; baseline: BucketTotals };
	findings: Finding[];
	clientName: string;
};

function formatMoney(n: number): string {
	const sign = n < 0 ? "-" : "";
	const abs = Math.abs(n);
	return `${sign}$${abs.toLocaleString(undefined, {
		minimumFractionDigits: 0,
		maximumFractionDigits: 0,
	})}`;
}

function topLineTable(totals: NarrativeInputs["totals"]): string {
	const { current, baseline } = totals;
	const row = (label: string, c: number, b: number) => {
		const delta = c - b;
		const pct =
			b === 0 ? "n/a" : `${(((c - b) / Math.abs(b)) * 100).toFixed(1)}%`;
		return `- ${label}: current ${formatMoney(c)}, baseline ${formatMoney(b)}, Δ ${formatMoney(delta)} (${pct})`;
	};
	return [
		row("Income", current.income, baseline.income),
		row("COGS", current.cogs, baseline.cogs),
		row("Gross profit", current.grossProfit, baseline.grossProfit),
		row("Operating expenses", current.expense, baseline.expense),
		row("Net income", current.netIncome, baseline.netIncome),
	].join("\n");
}

function buildPrompt(inputs: NarrativeInputs): string {
	const {
		period,
		accountingMethod,
		baselineLabel,
		totals,
		findings,
		clientName,
	} = inputs;
	const findingJson = findings.map((f) => ({
		id: f.id,
		detector: f.detector,
		severity: f.severity,
		title: f.title,
		evidence: f.evidence,
		affectedLinePaths: f.affectedLinePaths,
	}));
	return `You are a senior bookkeeper preparing the month-end close narrative for ${clientName}.

Period: ${period.start} to ${period.end}
Basis: ${accountingMethod}
Baseline comparison: ${baselineLabel}

Top-line totals:
${topLineTable(totals)}

Findings (produced by deterministic detectors — you MUST NOT invent new findings or numbers not present here):
${JSON.stringify(findingJson, null, 2)}

Write a concise month-end summary (3 to 6 sentences, under 180 words total) for the bookkeeper reviewing this close. Rules:
- Lead with the bottom-line movement (net income) and the one or two largest drivers.
- Reference specific findings by their id in square brackets like [material_expenses-rent-1000]. Every non-obvious claim must be anchored to a finding id.
- Do NOT invent variances, percentages, or dollar amounts that are not in the findings or top-line totals above.
- If a finding is ambiguous, say so explicitly.
- Tone: dry, reviewer-facing, no fluff, no emojis.

Also produce a one-sentence reviewer note for each finding id explaining WHY it matters (not what it says — the title already says that). Keep each note under 40 words. Do not include any finding id that is not in the list above.`;
}

/**
 * Calls Claude to narrate the given findings. The LLM receives ONLY the
 * structured findings + top-line totals; it does not see the raw P&L rows.
 * Returns a typed payload plus the raw prompt/response for audit.
 */
export async function narrateClose(
	inputs: NarrativeInputs,
): Promise<NarrativePayload> {
	const env = getEnv();
	const anthropic = createAnthropic({ apiKey: env.ANTHROPIC_API_KEY });
	const prompt = buildPrompt(inputs);

	if (inputs.findings.length === 0) {
		const summary = `Nothing material flagged for ${inputs.clientName} between ${inputs.period.start} and ${inputs.period.end} compared to the ${inputs.baselineLabel.toLowerCase()}. Net income moved from ${formatMoney(
			inputs.totals.baseline.netIncome,
		)} to ${formatMoney(inputs.totals.current.netIncome)}. Confirm this matches expectations before sign-off.`;
		return {
			summary,
			perFindingComments: {},
			modelVersion: "none",
			rawPrompt: prompt,
			rawResponse: "<skipped: no findings>",
		};
	}

	try {
		const { object, response } = await generateObject({
			model: anthropic(MODEL),
			schema: llmNarrativeSchema,
			temperature: 0.1,
			prompt,
		});
		const validIds = new Set(inputs.findings.map((f) => f.id));
		const filteredComments: Record<string, string> = {};
		for (const [id, note] of Object.entries(object.perFindingComments)) {
			if (validIds.has(id)) {
				filteredComments[id] = note;
			}
		}
		return {
			summary: object.summary,
			perFindingComments: filteredComments,
			modelVersion: MODEL,
			rawPrompt: prompt,
			rawResponse: JSON.stringify(response?.body ?? object),
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return {
			summary: `Automated narrative unavailable (${message}). Review the findings list manually.`,
			perFindingComments: {},
			modelVersion: MODEL,
			rawPrompt: prompt,
			rawResponse: `error: ${message}`,
		};
	}
}
