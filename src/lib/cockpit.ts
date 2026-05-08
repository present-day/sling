export const TabScope = {
	sales: "sales",
	purchases: "purchases",
	banking: "banking",
	books: "books",
	reports: "reports",
} as const

export type TabScope = (typeof TabScope)[keyof typeof TabScope]

export const TAB_ORDER: readonly TabScope[] = [
	TabScope.sales,
	TabScope.purchases,
	TabScope.banking,
	TabScope.books,
	TabScope.reports,
]

export const TAB_LABELS: Record<TabScope, string> = {
	sales: "Sales",
	purchases: "Purchases",
	banking: "Banking",
	books: "Books",
	reports: "Reports",
}

export const TAB_BLURBS: Record<TabScope, string> = {
	sales: "Customers, invoices, A/R",
	purchases: "Vendors, bills, A/P",
	banking: "Accounts, transfers, reconciliation",
	books: "Chart of accounts, journals, period-end",
	reports: "P&L, Balance Sheet, narrative",
}

export function isTabScope(value: string): value is TabScope {
	return value in TabScope
}

export function cockpitHref(clientId: string, scope: TabScope): string {
	return `/clients/${clientId}/cockpit/${scope}`
}
