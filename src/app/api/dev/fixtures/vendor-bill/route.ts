import { NextResponse } from "next/server"
import { renderSyntheticVendorBill } from "@/server/dev/fixtures"

/**
 * Dev-only fixture endpoint. Renders a synthetic vendor bill PDF on the fly
 * so the `/clients/[id]/dev-smoke` page can demo classify→post against the
 * sandbox without anyone having to find a real PDF on disk.
 *
 * Not authed beyond Next.js route handlers because the underlying mutations
 * (`uploads.classify`, `uploads.commit`) are themselves `orgProcedure`-gated.
 */
export async function GET() {
	const buf = await renderSyntheticVendorBill()
	return new NextResponse(new Uint8Array(buf), {
		status: 200,
		headers: {
			"Content-Type": "application/pdf",
			"Content-Disposition": 'inline; filename="vendor-bill.pdf"',
			"Cache-Control": "no-store",
		},
	})
}
