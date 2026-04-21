import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/server/auth";
import { buildQuickBooksAuthorizeUrl } from "@/server/qbo/oauth";

export async function GET(req: Request) {
	const session = await auth.api.getSession({ headers: req.headers });
	if (!session?.user) {
		return NextResponse.redirect(new URL("/sign-in", req.url));
	}
	if (!session.session?.activeOrganizationId) {
		return NextResponse.redirect(new URL("/onboarding", req.url));
	}
	const state = randomBytes(24).toString("hex");
	const cookieStore = await cookies();
	cookieStore.set("qbo_oauth_state", state, {
		httpOnly: true,
		sameSite: "lax",
		path: "/",
		maxAge: 600,
	});
	const target = buildQuickBooksAuthorizeUrl(state);
	return NextResponse.redirect(target);
}
