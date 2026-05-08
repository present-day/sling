import { randomBytes } from "node:crypto"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { auth } from "@/server/auth"
import { db } from "@/server/db/client"
import { buildQuickBooksAuthorizeUrl } from "@/server/qbo/oauth"

export async function GET(req: Request) {
	const session = await auth.api.getSession({ headers: req.headers })
	if (!session?.user) {
		return NextResponse.redirect(new URL("/sign-in", req.url))
	}
	const orgId = session.session?.activeOrganizationId
	if (!orgId) {
		return NextResponse.redirect(new URL("/onboarding", req.url))
	}
	const url = new URL(req.url)
	const reconnectClientId = url.searchParams.get("reconnectClientId")?.trim()
	const cookieStore = await cookies()
	if (reconnectClientId) {
		const row = await db.query.clients.findFirst({
			where: (c, { eq: eqFn, and: andFn }) =>
				andFn(eqFn(c.id, reconnectClientId), eqFn(c.orgId, orgId)),
		})
		if (!row) {
			return NextResponse.redirect(new URL("/clients", req.url))
		}
		cookieStore.set("qbo_oauth_reconnect_client_id", reconnectClientId, {
			httpOnly: true,
			sameSite: "lax",
			path: "/",
			maxAge: 600,
		})
	} else {
		cookieStore.delete("qbo_oauth_reconnect_client_id")
	}
	const state = randomBytes(24).toString("hex")
	cookieStore.set("qbo_oauth_state", state, {
		httpOnly: true,
		sameSite: "lax",
		path: "/",
		maxAge: 600,
	})
	const target = buildQuickBooksAuthorizeUrl(state)
	return NextResponse.redirect(target)
}
