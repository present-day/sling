import { NextResponse } from "next/server"

export async function POST() {
	return NextResponse.json(
		{
			message:
				"Admin chat streaming is not wired in this scaffold — add Vercel AI SDK per PLAN.md §10.",
		},
		{ status: 501 },
	)
}
