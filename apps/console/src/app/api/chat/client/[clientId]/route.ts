import { NextResponse } from "next/server";

export async function POST(
	_req: Request,
	_ctx: { params: Promise<{ clientId: string }> },
) {
	return NextResponse.json(
		{
			message:
				"Client chat streaming is not wired in this scaffold — add AI SDK per PLAN.md §10.",
		},
		{ status: 501 },
	);
}
