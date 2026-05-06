import "server-only"

import { createAnthropic } from "@ai-sdk/anthropic"
import type { FilePart, ImagePart, TextPart } from "@ai-sdk/provider-utils"
import { generateText } from "ai"
import { getEnv } from "@/lib/env"
import {
	type Classification,
	clampClassification,
	classificationSchema,
	ENTITY_KIND_DESCRIPTIONS,
	MAX_CANDIDATES,
} from "./entity-kinds"
import { spreadsheetToText } from "./spreadsheet"

const MODEL = "claude-sonnet-4-6" as const
const MAX_BYTES = 25 * 1024 * 1024

const SUPPORTED_MIME_PREFIXES = [
	"application/pdf",
	"image/",
	"text/csv",
	"application/vnd.ms-excel",
	"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
] as const

export class UnsupportedMimeError extends Error {
	constructor(mime: string) {
		super(`Unsupported upload mime: ${mime}`)
		this.name = "UnsupportedMimeError"
	}
}

export class FileTooLargeError extends Error {
	constructor(byteLength: number) {
		super(`File is too large (${byteLength} bytes; max ${MAX_BYTES})`)
		this.name = "FileTooLargeError"
	}
}

export type ClassifyInput = {
	bytes: Buffer
	mime: string
	fileName: string
}

export type ClassifyDeps = {
	apiKey?: string
	/** Test seam — replace the model call with a deterministic stub. */
	generate?: typeof generateText
}

export function isSupportedMime(mime: string): boolean {
	return SUPPORTED_MIME_PREFIXES.some((p) => mime.startsWith(p))
}

function buildSystemPrompt(): string {
	const entityList = Object.entries(ENTITY_KIND_DESCRIPTIONS)
		.map(([k, v]) => `- ${k}: ${v}`)
		.join("\n")
	return `You are Sling's document classifier for QuickBooks Online bookkeeping. Given a document a bookkeeper dropped into the app, you decide which QuickBooks entity it should become and pull out the fields needed to file it.

Allowed entity kinds:
${entityList}

Conventions:
- "vendorName" is the third-party supplier; "customerName" is the buyer of services.
- Use ISO dates (YYYY-MM-DD) for any date you extract.
- Numbers are plain numerics (no currency symbols, no commas).
- "totalAmount" is the grand total of the document, not a subtotal.
- For line items, populate description + amount at minimum; quantity/unitPrice only if explicit.
- "memo" captures any free-text note (Description, Notes, Re:, Memo) the bookkeeper would want to carry over.
- "reasoning" is one sentence — what about this doc made you pick that entity kind.

Output rules — respond with exactly one fenced JSON block (\`\`\`json … \`\`\`) and nothing else around it. No prose before or after.

Schema:
{
  "candidates": [
    {
      "entityKind": "<one of the allowed kinds>",
      "confidence": <number 0..1>,
      "extractedFields": {
        // any of these you can read; omit if absent
        "txnDate"?: "YYYY-MM-DD",
        "dueDate"?: "YYYY-MM-DD",
        "docNumber"?: string,
        "totalAmount"?: number,
        "taxAmount"?: number,
        "currency"?: string,
        "vendorName"?: string,
        "customerName"?: string,
        "paymentMethod"?: string,
        "appliedToDocNumbers"?: string[],
        "lines"?: [{ "description"?: string, "quantity"?: number, "unitPrice"?: number, "amount"?: number, "account"?: string }],
        "memo"?: string,
        "address"?: string,
        "email"?: string,
        "phone"?: string
      },
      "reasoning": "<one sentence>"
    }
  ],
  "notes"?: "<optional caveat>"
}

Return between 1 and ${MAX_CANDIDATES} candidates, ordered by likelihood (highest confidence first). The top candidate's confidence should be ≥0.6 when you're sure; lower it when the document is ambiguous and add alternatives. Always include extracted fields you can read directly from the document — do not invent values.`
}

function buildUserPrompt(fileName: string): string {
	return `File: ${fileName}

Classify this document and extract the fields. If you're unsure between two kinds, return both with calibrated confidences that sum to ~1. Respond with the JSON block only.`
}

const JSON_BLOCK_RE = /```(?:json)?\s*([\s\S]*?)```/i

export class ClassifierResponseError extends Error {
	constructor(message: string) {
		super(message)
		this.name = "ClassifierResponseError"
	}
}

function parseClassifierResponse(text: string): Classification {
	const match = text.match(JSON_BLOCK_RE)
	const raw = (match?.[1] ?? text).trim()
	let parsed: unknown
	try {
		parsed = JSON.parse(raw)
	} catch (e) {
		throw new ClassifierResponseError(
			`Classifier did not return parseable JSON: ${e instanceof Error ? e.message : String(e)}`,
		)
	}
	const result = classificationSchema.safeParse(parsed)
	if (!result.success) {
		throw new ClassifierResponseError(
			`Classifier output failed schema validation: ${result.error.message}`,
		)
	}
	return result.data
}

async function buildContent(
	input: ClassifyInput,
): Promise<Array<TextPart | ImagePart | FilePart>> {
	const blocks: Array<TextPart | ImagePart | FilePart> = [
		{ type: "text", text: buildUserPrompt(input.fileName) },
	]

	if (input.mime === "application/pdf") {
		blocks.push({
			type: "file",
			data: input.bytes,
			mediaType: "application/pdf",
			filename: input.fileName,
		})
		return blocks
	}

	if (input.mime.startsWith("image/")) {
		blocks.push({
			type: "image",
			image: input.bytes,
			mediaType: input.mime,
		})
		return blocks
	}

	if (
		input.mime === "text/csv" ||
		input.mime === "application/vnd.ms-excel" ||
		input.mime ===
			"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
	) {
		const tableText = await spreadsheetToText(input.bytes, input.mime)
		blocks.push({
			type: "text",
			text: `--- Parsed table ---\n${tableText}`,
		})
		return blocks
	}

	throw new UnsupportedMimeError(input.mime)
}

export async function classifyDocument(
	input: ClassifyInput,
	deps: ClassifyDeps = {},
): Promise<Classification> {
	if (input.bytes.length > MAX_BYTES) {
		throw new FileTooLargeError(input.bytes.length)
	}
	if (!isSupportedMime(input.mime)) {
		throw new UnsupportedMimeError(input.mime)
	}

	const apiKey = deps.apiKey ?? getEnv().ANTHROPIC_API_KEY
	const anthropic = createAnthropic({ apiKey })
	const generate = deps.generate ?? generateText

	const content = await buildContent(input)
	const { text } = await generate({
		model: anthropic(MODEL),
		temperature: 0.1,
		system: buildSystemPrompt(),
		messages: [
			{
				role: "user",
				content,
			},
		],
	})

	return clampClassification(parseClassifierResponse(text))
}
