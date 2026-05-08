import { NextResponse } from "next/server"

export async function GET() {
	return NextResponse.json(
		{
			message:
				"PDF export scaffold — add @react-pdf/renderer pipeline per PLAN.md §11.",
		},
		{ status: 501 },
	)
}
