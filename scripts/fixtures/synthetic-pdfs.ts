import {
	Document,
	type DocumentProps,
	Page,
	renderToBuffer,
	StyleSheet,
	Text,
	View,
} from "@react-pdf/renderer"
import React, { type ReactElement } from "react"

const styles = StyleSheet.create({
	page: { padding: 36, fontSize: 11, fontFamily: "Helvetica" },
	header: {
		flexDirection: "row",
		justifyContent: "space-between",
		marginBottom: 24,
	},
	brand: { fontSize: 20, fontWeight: 700 },
	addr: { color: "#555" },
	billTitle: {
		fontSize: 26,
		fontWeight: 700,
		textAlign: "right",
	},
	meta: { textAlign: "right", color: "#555", marginTop: 4 },
	billTo: { marginBottom: 16 },
	row: {
		flexDirection: "row",
		justifyContent: "space-between",
		paddingVertical: 6,
		borderBottomWidth: 1,
		borderBottomColor: "#ccc",
	},
	headerRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		paddingVertical: 6,
		borderBottomWidth: 2,
		borderBottomColor: "#000",
	},
	totals: {
		marginTop: 18,
		alignSelf: "flex-end",
		width: 220,
	},
	totalsRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		paddingVertical: 4,
	},
	grand: { fontSize: 14, fontWeight: 700 },
	footer: { marginTop: 36, color: "#666", fontSize: 10 },
})

const VendorBillDoc = (): ReactElement<DocumentProps> =>
	React.createElement(
		Document,
		null,
		React.createElement(
			Page,
			{ size: "LETTER", style: styles.page },
			React.createElement(
				View,
				{ style: styles.header },
				React.createElement(
					View,
					null,
					React.createElement(Text, { style: styles.brand }, "Acme Supply Co."),
					React.createElement(
						Text,
						{ style: styles.addr },
						"1200 Industrial Way",
					),
					React.createElement(
						Text,
						{ style: styles.addr },
						"Oakland, CA 94607",
					),
					React.createElement(
						Text,
						{ style: styles.addr },
						"billing@acmesupply.example",
					),
				),
				React.createElement(
					View,
					null,
					React.createElement(Text, { style: styles.billTitle }, "INVOICE"),
					React.createElement(
						Text,
						{ style: styles.meta },
						"Invoice #: INV-9001",
					),
					React.createElement(Text, { style: styles.meta }, "Date: 2026-04-15"),
					React.createElement(
						Text,
						{ style: styles.meta },
						"Due: 2026-05-15  ·  Net 30",
					),
				),
			),
			React.createElement(
				View,
				{ style: styles.billTo },
				React.createElement(Text, { style: { fontWeight: 700 } }, "Bill To:"),
				React.createElement(Text, null, "Sling Test Company"),
				React.createElement(Text, null, "456 Market St."),
				React.createElement(Text, null, "San Francisco, CA 94105"),
			),
			React.createElement(
				View,
				{ style: styles.headerRow },
				React.createElement(Text, { style: { width: "60%" } }, "Description"),
				React.createElement(
					Text,
					{ style: { width: "15%", textAlign: "right" } },
					"Qty",
				),
				React.createElement(
					Text,
					{ style: { width: "25%", textAlign: "right" } },
					"Amount",
				),
			),
			React.createElement(
				View,
				{ style: styles.row },
				React.createElement(
					Text,
					{ style: { width: "60%" } },
					"Bulk paper, 20 boxes",
				),
				React.createElement(
					Text,
					{ style: { width: "15%", textAlign: "right" } },
					"20",
				),
				React.createElement(
					Text,
					{ style: { width: "25%", textAlign: "right" } },
					"$1,200.00",
				),
			),
			React.createElement(
				View,
				{ style: styles.row },
				React.createElement(
					Text,
					{ style: { width: "60%" } },
					"Shipping & handling",
				),
				React.createElement(
					Text,
					{ style: { width: "15%", textAlign: "right" } },
					"1",
				),
				React.createElement(
					Text,
					{ style: { width: "25%", textAlign: "right" } },
					"$84.50",
				),
			),
			React.createElement(
				View,
				{ style: styles.totals },
				React.createElement(
					View,
					{ style: styles.totalsRow },
					React.createElement(Text, null, "Subtotal"),
					React.createElement(Text, null, "$1,284.50"),
				),
				React.createElement(
					View,
					{ style: styles.totalsRow },
					React.createElement(Text, null, "Tax (0%)"),
					React.createElement(Text, null, "$0.00"),
				),
				React.createElement(
					View,
					{ style: { ...styles.totalsRow, borderTopWidth: 1, paddingTop: 6 } },
					React.createElement(Text, { style: styles.grand }, "Total Due"),
					React.createElement(Text, { style: styles.grand }, "$1,284.50"),
				),
			),
			React.createElement(
				Text,
				{ style: styles.footer },
				"Make checks payable to Acme Supply Co. or remit ACH to routing 121000358 acct 1234-5678. Thank you for your business.",
			),
		),
	)

export async function renderSyntheticVendorBill(): Promise<Buffer> {
	return renderToBuffer(VendorBillDoc())
}
