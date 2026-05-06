import { and, eq } from "drizzle-orm"
import { NextResponse } from "next/server"
import { auth } from "@/server/auth"
import { db } from "@/server/db/client"
import { documentUploads } from "@/server/db/schema"
import { readUpload } from "@/server/uploads/storage"

export async function GET(
	req: Request,
	{ params }: { params: Promise<{ uploadId: string }> },
) {
	const session = await auth.api.getSession({ headers: req.headers })
	if (!session?.user) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
	}
	const orgId = session.session?.activeOrganizationId
	if (!orgId) {
		return NextResponse.json({ error: "No active org" }, { status: 400 })
	}

	const { uploadId } = await params
	const row = await db.query.documentUploads.findFirst({
		where: and(
			eq(documentUploads.id, uploadId),
			eq(documentUploads.orgId, orgId),
		),
	})
	if (!row) {
		return NextResponse.json({ error: "Not found" }, { status: 404 })
	}

	let bytes: Buffer
	try {
		bytes = await readUpload(row.storagePath)
	} catch {
		return NextResponse.json(
			{ error: "Upload missing on disk" },
			{ status: 410 },
		)
	}

	const arrayBuffer = bytes.buffer.slice(
		bytes.byteOffset,
		bytes.byteOffset + bytes.byteLength,
	) as ArrayBuffer
	return new NextResponse(arrayBuffer, {
		status: 200,
		headers: {
			"content-type": row.mime,
			"content-length": String(row.byteLength),
			"content-disposition": `inline; filename="${encodeURIComponent(row.fileName)}"`,
			"cache-control": "private, no-store",
		},
	})
}
