import "server-only"

import { existsSync } from "node:fs"
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises"
import path from "node:path"

const UPLOADS_DIR = path.resolve(process.cwd(), ".data", "uploads")

const MIME_EXT: Record<string, string> = {
	"application/pdf": "pdf",
	"image/png": "png",
	"image/jpeg": "jpg",
	"image/heic": "heic",
	"image/webp": "webp",
	"text/csv": "csv",
	"application/vnd.ms-excel": "xls",
	"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
}

function extFor(mime: string): string {
	return MIME_EXT[mime] ?? "bin"
}

export function uploadStoragePath(
	orgId: string,
	uploadId: string,
	mime: string,
): string {
	return path.join(UPLOADS_DIR, orgId, `${uploadId}.${extFor(mime)}`)
}

export async function persistUpload(
	orgId: string,
	uploadId: string,
	mime: string,
	bytes: Buffer,
): Promise<string> {
	const filePath = uploadStoragePath(orgId, uploadId, mime)
	await mkdir(path.dirname(filePath), { recursive: true })
	await writeFile(filePath, bytes)
	return filePath
}

export async function readUpload(storagePath: string): Promise<Buffer> {
	if (!isInsideUploadsDir(storagePath)) {
		throw new Error("Upload path outside the uploads directory")
	}
	if (!existsSync(storagePath)) {
		throw new Error("Upload file missing")
	}
	return readFile(storagePath)
}

export async function deleteUpload(storagePath: string): Promise<void> {
	if (!isInsideUploadsDir(storagePath)) return
	if (!existsSync(storagePath)) return
	await unlink(storagePath)
}

function isInsideUploadsDir(p: string): boolean {
	const resolved = path.resolve(p)
	const base = `${UPLOADS_DIR}${path.sep}`
	return resolved.startsWith(base)
}
