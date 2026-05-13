import "server-only"
import { eq } from "drizzle-orm"
import { db } from "@/server/db/client"
import { type clients, clients as clientsTable } from "@/server/db/schema"
import { refreshQuickBooksAccessToken } from "@/server/qbo/oauth"
import { decryptRefreshToken, encryptRefreshToken } from "@/server/qbo/tokens"

type ClientRow = typeof clients.$inferSelect

const SANDBOX_BASE = "https://sandbox-quickbooks.api.intuit.com"
const PRODUCTION_BASE = "https://quickbooks.api.intuit.com"

const MINOR_VERSION = "75"

export class IntuitApiError extends Error {
	constructor(
		public readonly status: number,
		public readonly intuitFault: unknown,
		public readonly endpoint: string,
	) {
		super(`Intuit ${endpoint} failed: HTTP ${status}`)
		this.name = "IntuitApiError"
	}
}

export interface IntuitClient {
	/** POST a v3 entity create. `entityName` is the QBO API path stem (e.g. "salesreceipt"). Returns the created entity body. */
	createEntity<T = Record<string, unknown>>(
		entityName: string,
		body: unknown,
	): Promise<T>
	/** Upload an Attachable linked to a created entity. Returns the Attachable record. */
	uploadAttachable(args: {
		fileName: string
		mime: string
		bytes: Buffer
		attachable: AttachableMetadata
	}): Promise<{ Id: string } & Record<string, unknown>>
}

export interface AttachableMetadata {
	FileName: string
	ContentType: string
	AttachableRef: Array<{
		EntityRef: { type: string; value: string }
		IncludeOnSend?: boolean
	}>
	Note?: string
}

function baseUrlFor(env: ClientRow["environment"]): string {
	return env === "production" ? PRODUCTION_BASE : SANDBOX_BASE
}

/**
 * Per-request access-token resolver. Refreshes against Intuit's OAuth, and if
 * Intuit rotated the refresh token, persists the new one encrypted into
 * `clients.encryptedRefreshToken` so the next request picks it up.
 *
 * Direct v3 calls only — does not go through `quickbooks-mcp` (see #19).
 */
async function getAccessToken(client: ClientRow): Promise<string> {
	const refreshToken = decryptRefreshToken(client.encryptedRefreshToken)
	const refreshed = await refreshQuickBooksAccessToken(refreshToken)
	if (refreshed.refreshToken && refreshed.refreshToken !== refreshToken) {
		await db
			.update(clientsTable)
			.set({
				encryptedRefreshToken: encryptRefreshToken(refreshed.refreshToken),
				tokenUpdatedAt: new Date(),
			})
			.where(eq(clientsTable.id, client.id))
	}
	return refreshed.accessToken
}

async function parseIntuitFault(res: Response): Promise<unknown> {
	const text = await res.text().catch(() => "")
	try {
		return JSON.parse(text)
	} catch {
		return { rawBody: text.slice(0, 1024) }
	}
}

export function makeIntuitClient(client: ClientRow): IntuitClient {
	const base = baseUrlFor(client.environment)
	const realmId = client.realmId

	async function createEntity<T = Record<string, unknown>>(
		entityName: string,
		body: unknown,
	): Promise<T> {
		const accessToken = await getAccessToken(client)
		const url = `${base}/v3/company/${realmId}/${entityName}?minorversion=${MINOR_VERSION}`
		const res = await fetch(url, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${accessToken}`,
				"Content-Type": "application/json",
				Accept: "application/json",
			},
			body: JSON.stringify(body),
		})
		if (!res.ok) {
			throw new IntuitApiError(
				res.status,
				await parseIntuitFault(res),
				entityName,
			)
		}
		return (await res.json()) as T
	}

	async function uploadAttachable({
		fileName,
		mime,
		bytes,
		attachable,
	}: {
		fileName: string
		mime: string
		bytes: Buffer
		attachable: AttachableMetadata
	}): Promise<{ Id: string } & Record<string, unknown>> {
		const accessToken = await getAccessToken(client)
		const url = `${base}/v3/company/${realmId}/upload?minorversion=${MINOR_VERSION}`
		const boundary = `----slingUpload${Date.now().toString(36)}`
		const body = buildMultipart({
			boundary,
			fileName,
			mime,
			bytes,
			attachable,
		})
		const res = await fetch(url, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${accessToken}`,
				"Content-Type": `multipart/form-data; boundary=${boundary}`,
				Accept: "application/json",
			},
			body: bufferToBlob(body),
		})
		if (!res.ok) {
			throw new IntuitApiError(
				res.status,
				await parseIntuitFault(res),
				"upload",
			)
		}
		const json = (await res.json()) as {
			AttachableResponse?: Array<{ Attachable?: { Id?: string } }>
		}
		const created = json.AttachableResponse?.[0]?.Attachable
		if (!created?.Id) {
			throw new IntuitApiError(
				res.status,
				{ message: "Attachable response missing Id", body: json },
				"upload",
			)
		}
		return created as { Id: string } & Record<string, unknown>
	}

	return { createEntity, uploadAttachable }
}

/**
 * Build the two-part multipart body Intuit requires for /v3/.../upload:
 *  - file_metadata_0: application/json Attachable descriptor
 *  - file_content_0:  the source file bytes
 *
 * The `_0` suffix is the upload-batch index. We only ever send one file.
 */
function buildMultipart({
	boundary,
	fileName,
	mime,
	bytes,
	attachable,
}: {
	boundary: string
	fileName: string
	mime: string
	bytes: Buffer
	attachable: AttachableMetadata
}): Buffer {
	const lineBreak = "\r\n"
	const dashes = "--"

	const metadataJson = Buffer.from(JSON.stringify(attachable), "utf8")
	const head =
		`${dashes}${boundary}${lineBreak}` +
		`Content-Disposition: form-data; name="file_metadata_0"${lineBreak}` +
		`Content-Type: application/json${lineBreak}${lineBreak}`
	const between =
		`${lineBreak}${dashes}${boundary}${lineBreak}` +
		`Content-Disposition: form-data; name="file_content_0"; filename="${escapeFilename(fileName)}"${lineBreak}` +
		`Content-Type: ${mime}${lineBreak}${lineBreak}`
	const tail = `${lineBreak}${dashes}${boundary}${dashes}${lineBreak}`

	return Buffer.concat([
		Buffer.from(head, "utf8"),
		metadataJson,
		Buffer.from(between, "utf8"),
		bytes,
		Buffer.from(tail, "utf8"),
	])
}

function escapeFilename(name: string): string {
	return name.replace(/["\r\n]/g, "_")
}

// Node Buffer's underlying `.buffer` is typed as ArrayBufferLike, which the
// DOM `BlobPart` type rejects (it requires ArrayBuffer). Copy the bytes into a
// fresh, non-shared ArrayBuffer so the Blob constructor type-checks.
function bufferToBlob(buf: Buffer): Blob {
	const copy = new Uint8Array(buf.byteLength)
	copy.set(buf)
	return new Blob([copy.buffer])
}
