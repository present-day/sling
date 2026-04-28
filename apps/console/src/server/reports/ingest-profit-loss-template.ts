import "server-only";

import { createAnthropic } from "@ai-sdk/anthropic";
import { generateObject } from "ai";
import { getEnv } from "@/lib/env";
import {
	llmProfitLossConfigSchema,
	mergeLlmIntoProfitLossConfig,
	type ProfitLossTemplateConfig,
} from "@/server/reports/profit-loss-config";

const MODEL = "claude-sonnet-4-20250514" as const;

function buildPrompt(extractedText: string): string {
	const snippet = extractedText.slice(0, 16_000);
	return `You are given plain text extracted from a Profit and Loss report PDF. It may be messy (columns split across lines). Infer how the org likes this report to read: a short display name, optional custom title/footer, and whether to prefer cash or accrual if you can tell.

Also describe sections as table or kpi/kpi_grid rows. Use type "kpi" or "kpi_grid" for summary KPIs if the PDF has a summary strip; otherwise "table" for the main P&L grid.

Text from PDF:
---
${snippet}
---
Return JSON matching the schema. If unsure, omit optional fields.`;
}

export async function generateProfitLossConfigFromExtractedText(
	extractedText: string,
): Promise<ProfitLossTemplateConfig> {
	if (!extractedText.trim()) {
		return mergeLlmIntoProfitLossConfig("", {});
	}
	const env = getEnv();
	const anthropic = createAnthropic({ apiKey: env.ANTHROPIC_API_KEY });
	try {
		const { object } = await generateObject({
			model: anthropic(MODEL),
			schema: llmProfitLossConfigSchema,
			temperature: 0.1,
			prompt: buildPrompt(extractedText),
		});
		return mergeLlmIntoProfitLossConfig(extractedText, object);
	} catch {
		return mergeLlmIntoProfitLossConfig(extractedText, {});
	}
}
