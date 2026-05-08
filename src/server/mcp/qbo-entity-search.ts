import "server-only"
import {
	ENTITY_QBO_QUERY_ENTITY,
	ENTITY_SEARCH_QUERY_KEY,
} from "@/lib/entity-search"
import type { clients } from "@/server/db/schema"
import { callQboTool } from "@/server/mcp/pool"

type ClientRow = typeof clients.$inferSelect

// ---------------------------------------------------------------------------
// Tool name resolution
// ---------------------------------------------------------------------------

/**
 * All quickbooks-mcp search tools follow the convention `search_<stem>`.
 * The stem is the same key used in ENTITY_QBO_QUERY_ENTITY (e.g. "bill_payments",
 * "sales_receipts"). We validate against the known entity map so unknown stems
 * fail fast rather than sending an unrecognised tool name to the MCP server.
 */
function toolNameForStem(entityStem: string): string {
	if (!ENTITY_QBO_QUERY_ENTITY[entityStem]) {
		throw new Error(`Unknown QuickBooks entity stem: ${entityStem}`)
	}
	return `search_${entityStem}`
}

// ---------------------------------------------------------------------------
// Criteria builder
// ---------------------------------------------------------------------------

/**
 * Build the `criteria` array expected by quickbooks-mcp search tools.
 *
 * When a text filter is provided we use the field from ENTITY_SEARCH_QUERY_KEY
 * (e.g. DisplayName for customers, DocNumber for invoices) with a LIKE operator
 * so partial matches work. Entities that have no configured filter field are
 * returned unfiltered (the textFilter is silently ignored for those stems).
 */
function buildCriteria(
	entityStem: string,
	textFilter: string | undefined,
	limit: number,
): Record<string, unknown> {
	const filterField = ENTITY_SEARCH_QUERY_KEY[entityStem]
	const q = textFilter?.trim()

	if (q && filterField) {
		return {
			criteria: [{ field: filterField, value: `%${q}%`, operator: "LIKE" }],
			limit,
		}
	}

	return { limit }
}

// ---------------------------------------------------------------------------
// Response parser
// ---------------------------------------------------------------------------

/**
 * quickbooks-mcp search tools return MCP content as an array of text items:
 *
 *   [
 *     { type: "text", text: "Found N customers:" },   ← summary line
 *     { type: "text", text: "{...}" },                ← JSON entity
 *     { type: "text", text: "{...}" },
 *     ...
 *   ]
 *
 * We skip the summary line and JSON.parse the rest into plain objects.
 */
function parseSearchResponse(result: unknown): unknown[] {
	const content = (result as { content?: unknown[] })?.content
	if (!Array.isArray(content) || content.length === 0) return []

	// First item is always the "Found N <entities>:" summary — skip it
	return content.slice(1).flatMap((item) => {
		const text = (item as { text?: string })?.text
		if (!text) return []
		try {
			return [JSON.parse(text)]
		} catch {
			return []
		}
	})
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Search a QuickBooks entity list via the quickbooks-mcp pool.
 *
 * Drop-in replacement for the SQL-based searchQboEntityList — same signature,
 * same return shape (array of raw QB entity objects).
 *
 * Caller must have already verified tenant access (ensureClientInOrg).
 */
export async function searchQboEntityListViaMcp(
	client: ClientRow,
	entityStem: string,
	textFilter: string | undefined,
	limit: number,
): Promise<unknown[]> {
	const toolName = toolNameForStem(entityStem)
	const args = buildCriteria(entityStem, textFilter, limit)
	const result = await callQboTool(client, toolName, args)
	return parseSearchResponse(result)
}
