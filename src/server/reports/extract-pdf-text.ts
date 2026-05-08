import "server-only"

import { existsSync } from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { PDFParse } from "pdf-parse"

function resolvePdfjsWorkerFile(): string {
	const direct = path.join(
		process.cwd(),
		"node_modules",
		"pdfjs-dist",
		"legacy",
		"build",
		"pdf.worker.mjs",
	)
	if (existsSync(direct)) return direct
	const parent = path.join(
		process.cwd(),
		"..",
		"node_modules",
		"pdfjs-dist",
		"legacy",
		"build",
		"pdf.worker.mjs",
	)
	if (existsSync(parent)) return parent
	throw new Error(
		"pdfjs-dist worker not found; ensure pdfjs-dist is installed (e.g. cd apps/console && bun add pdfjs-dist).",
	)
}

PDFParse.setWorker(pathToFileURL(resolvePdfjsWorkerFile()).href)

const MAX_PDF_BYTES = 5 * 1024 * 1024

export function assertPdfSizeOk(byteLength: number): void {
	if (byteLength > MAX_PDF_BYTES) {
		throw new Error(`PDF is too large (max ${MAX_PDF_BYTES / 1024 / 1024} MB)`)
	}
}

export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
	assertPdfSizeOk(buffer.length)
	const u8 = new Uint8Array(buffer)
	const parser = new PDFParse({ data: u8 })
	try {
		const result = await parser.getText()
		return result.text?.trim() ?? ""
	} finally {
		await parser.destroy()
	}
}
