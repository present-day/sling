export type NavItem = {
	href: string
	label: string
}

export const clientNavGroups: { label: string; items: NavItem[] }[] = [
	{
		label: "Overview",
		items: [{ href: "", label: "Overview" }],
	},
	{
		label: "Transactional",
		items: [
			{ href: "customers", label: "Customers" },
			{ href: "vendors", label: "Vendors" },
			{ href: "invoices", label: "Invoices" },
			{ href: "payments", label: "Payments" },
			{ href: "bills", label: "Bills" },
			{ href: "bill-payments", label: "Bill Payments" },
			{ href: "sales-receipts", label: "Sales Receipts" },
			{ href: "credit-memos", label: "Credit Memos" },
			{ href: "refund-receipts", label: "Refund Receipts" },
			{ href: "deposits", label: "Deposits" },
			{ href: "transfers", label: "Transfers" },
			{ href: "estimates", label: "Estimates" },
			{ href: "purchase-orders", label: "Purchase Orders" },
			{ href: "vendor-credits", label: "Vendor Credits" },
			{ href: "purchases", label: "Purchases" },
			{ href: "journal-entries", label: "Journal Entries" },
			{ href: "time-activities", label: "Time Activities" },
			{ href: "attachables", label: "Attachables" },
		],
	},
	{
		label: "Chart of accounts",
		items: [
			{ href: "accounts", label: "Accounts" },
			{ href: "classes", label: "Classes" },
			{ href: "departments", label: "Departments" },
		],
	},
	{
		label: "Settings",
		items: [
			{ href: "settings/terms", label: "Terms" },
			{ href: "settings/payment-methods", label: "Payment Methods" },
			{ href: "settings/tax/codes", label: "Tax — Codes" },
			{ href: "settings/tax/rates", label: "Tax — Rates" },
			{ href: "settings/tax/agencies", label: "Tax — Agencies" },
			{ href: "settings/company-info", label: "Company Info" },
		],
	},
	{
		label: "Reports & tools",
		items: [
			{ href: "reports", label: "Reports" },
			{ href: "chat", label: "Chat" },
		],
	},
]

export const reportNav: NavItem[] = [
	{ href: "profit-loss", label: "Profit & Loss" },
	{ href: "balance-sheet", label: "Balance Sheet" },
	{ href: "cash-flow", label: "Cash Flow" },
	{ href: "trial-balance", label: "Trial Balance" },
	{ href: "general-ledger", label: "General Ledger" },
	{ href: "customer-sales", label: "Customer Sales" },
	{ href: "aged-receivables", label: "Aged Receivables" },
	{ href: "aged-receivables-detail", label: "Aged Receivables (Detail)" },
	{ href: "customer-balance", label: "Customer Balance" },
	{ href: "aged-payables", label: "Aged Payables" },
	{ href: "vendor-expenses", label: "Vendor Expenses" },
]

export const adminNav: NavItem[] = [
	{ href: "/admin/chat", label: "Admin chat" },
	{ href: "/admin/organization", label: "Organization" },
	{ href: "/admin/users", label: "Users" },
]
