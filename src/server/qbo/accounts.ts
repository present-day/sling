import "server-only"
import type { IntuitClient } from "@/server/qbo/intuit-client"

export type QboAccount = {
	id: string
	name: string
	accountType: string
	fullyQualifiedName: string
}

/**
 * List the accounts a Bill expense line can post against. QBO's
 * `Classification = 'Expense'` bucket covers Expense, Other Expense, and Cost
 * of Goods Sold — the categories a vendor bill is normally coded to. We sort
 * client-side to avoid relying on QBO's ORDER BY (which 400s on some fields).
 *
 * Direct v3 query — does not go through the quickbooks-mcp pool (see #19).
 */
export async function listExpenseAccounts(
	intuit: IntuitClient,
): Promise<QboAccount[]> {
	const query =
		"SELECT Id, Name, AccountType, FullyQualifiedName FROM Account WHERE Classification = 'Expense' MAXRESULTS 200"
	const res = await intuit.queryEntity<{
		QueryResponse?: {
			Account?: Array<{
				Id: string
				Name: string
				AccountType: string
				FullyQualifiedName?: string
			}>
		}
	}>(query)
	const rows = res.QueryResponse?.Account ?? []
	return rows
		.map((a) => ({
			id: a.Id,
			name: a.Name,
			accountType: a.AccountType,
			fullyQualifiedName: a.FullyQualifiedName ?? a.Name,
		}))
		.sort((a, b) => a.fullyQualifiedName.localeCompare(b.fullyQualifiedName))
}
