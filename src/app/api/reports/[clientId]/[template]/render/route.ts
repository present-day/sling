import { NextResponse } from "next/server";

export async function GET(
	_req: Request,
	_ctx: { params: Promise<{ clientId: string; template: string }> },
) {
	const { clientId, template } = await _ctx.params;
	return new NextResponse(
		`<!DOCTYPE html><html><body><h1>Report ${template}</h1><p>Client ${clientId}</p><p>Implement HTML renderer in src/server/reports/ per PLAN.md §11.</p></body></html>`,
		{ headers: { "Content-Type": "text/html; charset=utf-8" } },
	);
}
