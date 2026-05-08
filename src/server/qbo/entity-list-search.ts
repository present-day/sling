import "server-only"
import type { clients } from "@/server/db/schema"
import { searchQboEntityListViaMcp } from "@/server/mcp/qbo-entity-search"

type ClientRow = typeof clients.$inferSelect

/**
 * Search a QuickBooks entity list for a given client.
 * Delegates to the quickbooks-mcp pool — no direct Intuit HTTP calls here.
 *
 * Caller must have already verified tenant access (ensureClientInOrg).
 */
export async function searchQboEntityList(
	client: ClientRow,
	entityStem: string,
	textFilter: string | undefined,
	limit: number,
): Promise<unknown[]> {
	return searchQboEntityListViaMcp(client, entityStem, textFilter, limit)
}
