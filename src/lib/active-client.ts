"use client"

import { usePathname } from "next/navigation"

const CLIENT_PATH_RE = /^\/clients\/([^/]+)/

/**
 * Reads the active client id from the URL when the user is inside a
 * `/clients/[clientId]/...` route. Returns `null` outside of those routes,
 * which the dropzone uses to skip drag-drop interception when there is no
 * upload target in scope.
 */
export function useActiveClientId(): string | null {
	const pathname = usePathname()
	const match = pathname?.match(CLIENT_PATH_RE)
	return match?.[1] ?? null
}
