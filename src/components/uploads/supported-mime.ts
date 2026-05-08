/**
 * Client-side mirror of `isSupportedMime` from `@/server/uploads/classify`.
 * Duplicated to avoid pulling the server module (which imports `server-only`)
 * into a client bundle. Keep in sync with the server list.
 */
const SUPPORTED_MIME_PREFIXES = [
	"application/pdf",
	"image/",
	"text/csv",
	"application/vnd.ms-excel",
	"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
] as const

export function isSupportedClientMime(mime: string): boolean {
	return SUPPORTED_MIME_PREFIXES.some((p) => mime.startsWith(p))
}

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024
