import { NextResponse } from "next/server"

export async function GET() {
	return NextResponse.json(
		{ message: "XLSX export scaffold — add exceljs pipeline per PLAN.md §11." },
		{ status: 501 },
	)
}
