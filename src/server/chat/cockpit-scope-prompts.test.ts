import { describe, expect, it } from "vitest"
import { TAB_ORDER } from "@/lib/cockpit"
import { buildCockpitScopeSystemPrompt } from "./cockpit-scope-prompts"

describe("buildCockpitScopeSystemPrompt", () => {
	it("returns a non-empty prompt for every cockpit tab", () => {
		for (const scope of TAB_ORDER) {
			const prompt = buildCockpitScopeSystemPrompt(scope)
			expect(prompt.length).toBeGreaterThan(100)
		}
	})

	it("scopes prompts to their tab — the prompt mentions the tab label", () => {
		expect(buildCockpitScopeSystemPrompt("sales")).toMatch(/\bSales\b/)
		expect(buildCockpitScopeSystemPrompt("purchases")).toMatch(/\bPurchases\b/)
		expect(buildCockpitScopeSystemPrompt("banking")).toMatch(/\bBanking\b/)
		expect(buildCockpitScopeSystemPrompt("books")).toMatch(/\bBooks\b/)
		expect(buildCockpitScopeSystemPrompt("reports")).toMatch(/\bReports\b/)
	})

	it("warns about lack of live QB data access (so Claude doesn't hallucinate)", () => {
		for (const scope of TAB_ORDER) {
			const prompt = buildCockpitScopeSystemPrompt(scope)
			expect(prompt).toMatch(/do NOT currently have live access/i)
		}
	})

	it("each scope prompt is distinguishable from the others", () => {
		const prompts = TAB_ORDER.map((s) => buildCockpitScopeSystemPrompt(s))
		const unique = new Set(prompts)
		expect(unique.size).toBe(TAB_ORDER.length)
	})
})
