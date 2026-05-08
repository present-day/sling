import { mkdir, unlink, writeFile } from "node:fs/promises"
import path from "node:path"
import { createId } from "@paralleldrive/cuid2"
import { eq } from "drizzle-orm"
import { NextResponse } from "next/server"
import { auth } from "@/server/auth"
import { db } from "@/server/db/client"
import { reportTemplates } from "@/server/db/schema"
import { extractTextFromPdf } from "@/server/reports/extract-pdf-text"
import { generateProfitLossConfigFromExtractedText } from "@/server/reports/ingest-profit-loss-template"
import { defaultProfitLossTemplateConfig } from "@/server/reports/profit-loss-config"

const SLUG = "profit-loss" as const

export async function POST(req: Request) {
	const session = await auth.api.getSession({ headers: req.headers })
	if (!session?.user) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
	}
	const orgId = session.session?.activeOrganizationId
	if (!orgId) {
		return NextResponse.json(
			{ error: "Select an organization first" },
			{ status: 400 },
		)
	}

	let form: FormData
	try {
		form = await req.formData()
	} catch {
		return NextResponse.json({ error: "Invalid form data" }, { status: 400 })
	}
	const file = form.get("file")
	if (!file || !(file instanceof File)) {
		return NextResponse.json({ error: "Missing file field" }, { status: 400 })
	}
	if (
		file.type &&
		!file.type.includes("pdf") &&
		!file.name.toLowerCase().endsWith(".pdf")
	) {
		return NextResponse.json(
			{ error: "Only PDF files are accepted" },
			{ status: 400 },
		)
	}

	const arrayBuf = await file.arrayBuffer()
	const buf = Buffer.from(arrayBuf)

	let extracted: string
	try {
		extracted = await extractTextFromPdf(buf)
	} catch (e) {
		const message = e instanceof Error ? e.message : "Could not read PDF"
		return NextResponse.json({ error: message }, { status: 400 })
	}

	const config = await generateProfitLossConfigFromExtractedText(extracted)
	const name = config.name || defaultProfitLossTemplateConfig.name
	const fileId = createId()
	const relPath = `report-templates/${orgId}/${fileId}.pdf`
	const fullPath = path.join(process.cwd(), ".data", relPath)
	await mkdir(path.dirname(fullPath), { recursive: true })
	await writeFile(fullPath, buf)

	const existing = await db.query.reportTemplates.findFirst({
		where: (r, { and: andFn, eq: eqFn }) =>
			andFn(eqFn(r.orgId, orgId), eqFn(r.slug, SLUG)),
	})

	if (existing?.sourcePdfStoragePath) {
		const old = path.join(process.cwd(), ".data", existing.sourcePdfStoragePath)
		try {
			await unlink(old)
		} catch {
			/* best-effort */
		}
	}

	const rowId = existing?.id ?? createId()
	if (existing) {
		await db
			.update(reportTemplates)
			.set({
				name,
				kind: "profit_loss",
				config,
				sourcePdfFileName: file.name || "template.pdf",
				sourcePdfStoragePath: relPath,
			})
			.where(eq(reportTemplates.id, existing.id))
	} else {
		await db.insert(reportTemplates).values({
			id: rowId,
			orgId,
			slug: SLUG,
			name,
			kind: "profit_loss",
			config,
			sourcePdfFileName: file.name || "template.pdf",
			sourcePdfStoragePath: relPath,
		})
	}

	return NextResponse.json({ ok: true as const, slug: SLUG })
}
