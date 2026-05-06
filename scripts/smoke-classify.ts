/**
 * Smoke test for the document classifier against the real Anthropic API.
 *
 *   bun run scripts/smoke-classify.ts                         # built-in CSV + synthetic PDF fixtures
 *   bun run scripts/smoke-classify.ts path/to/file.pdf        # one real file
 *   bun run scripts/smoke-classify.ts a.pdf b.png c.csv       # several
 *
 * Reads ANTHROPIC_API_KEY from .env.local (loaded by the dotenv side-effect
 * import below — same approach `next dev` uses).
 */

import { readFile } from "node:fs/promises"
import path from "node:path"

// Bun auto-loads .env.local for `bun run`; this script must be invoked via
// bun, not tsx. See package.json scripts pattern.

if (!process.env.ANTHROPIC_API_KEY) {
	console.error(
		"ANTHROPIC_API_KEY missing from .env.local — add it before running this smoke test.",
	)
	process.exit(1)
}

const { classifyDocument } = await import("../src/server/uploads/classify")
const { renderSyntheticVendorBill } = await import("./fixtures/synthetic-pdfs")

const MIME_FROM_EXT: Record<string, string> = {
	".pdf": "application/pdf",
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".heic": "image/heic",
	".webp": "image/webp",
	".csv": "text/csv",
	".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
	".xls": "application/vnd.ms-excel",
}

type Sample = { fileName: string; mime: string; bytes: Buffer; label: string }

async function builtInSamples(): Promise<Sample[]> {
	const csv = [
		"Date,Description,Amount",
		"2026-04-15,Bulk paper - Acme Supply,1200.00",
		"2026-04-15,Shipping,84.50",
	].join("\n")
	const samples: Sample[] = [
		{
			label: "csv (general ledger import)",
			fileName: "ledger.csv",
			mime: "text/csv",
			bytes: Buffer.from(csv, "utf8"),
		},
	]
	try {
		const pdfBytes = await renderSyntheticVendorBill()
		samples.push({
			label: "pdf (synthetic vendor bill)",
			fileName: "acme-bill.pdf",
			mime: "application/pdf",
			bytes: pdfBytes,
		})
	} catch (e) {
		console.warn(
			`Skipping synthetic PDF fixture: ${e instanceof Error ? e.message : String(e)}`,
		)
	}
	return samples
}

async function fileToSample(filePath: string): Promise<Sample> {
	const bytes = await readFile(filePath)
	const ext = path.extname(filePath).toLowerCase()
	const mime = MIME_FROM_EXT[ext]
	if (!mime) {
		throw new Error(`Unrecognized extension ${ext} on ${filePath}`)
	}
	return {
		label: path.basename(filePath),
		fileName: path.basename(filePath),
		mime,
		bytes,
	}
}

async function main(): Promise<void> {
	const args = process.argv.slice(2)
	const samples =
		args.length === 0
			? await builtInSamples()
			: await Promise.all(args.map(fileToSample))

	for (const sample of samples) {
		console.log(
			`\n── ${sample.label} (${sample.mime}, ${sample.bytes.length}B)`,
		)
		const t0 = Date.now()
		try {
			const result = await classifyDocument({
				bytes: sample.bytes,
				mime: sample.mime,
				fileName: sample.fileName,
			})
			const ms = Date.now() - t0
			console.log(`  ${ms}ms  candidates=${result.candidates.length}`)
			for (const [i, c] of result.candidates.entries()) {
				console.log(
					`  [${i}] ${c.entityKind.padEnd(14)} conf=${c.confidence.toFixed(2)}  ${c.reasoning}`,
				)
				const fields = Object.entries(c.extractedFields).filter(
					([, v]) => v !== undefined,
				)
				if (fields.length > 0) {
					console.log(
						`       fields: ${fields
							.map(
								([k, v]) =>
									`${k}=${typeof v === "string" ? v : JSON.stringify(v)}`,
							)
							.join("  ")}`,
					)
				}
			}
			if (result.notes) console.log(`  notes: ${result.notes}`)
		} catch (e) {
			console.error(`  failed: ${e instanceof Error ? e.message : String(e)}`)
		}
	}
}

await main()
