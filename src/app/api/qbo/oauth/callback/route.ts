import { createId } from "@paralleldrive/cuid2";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { auth } from "@/server/auth";
import { db } from "@/server/db/client";
import { clientMembers, clients } from "@/server/db/schema";
import { exchangeAuthorizationCode } from "@/server/qbo/oauth";
import { encryptRefreshToken } from "@/server/qbo/tokens";

export async function GET(req: Request) {
	const session = await auth.api.getSession({ headers: req.headers });
	if (!session?.user) {
		return NextResponse.redirect(new URL("/sign-in", req.url));
	}
	const orgId = session.session?.activeOrganizationId;
	if (!orgId) {
		return NextResponse.redirect(new URL("/onboarding", req.url));
	}
	const url = new URL(req.url);
	const code = url.searchParams.get("code");
	const state = url.searchParams.get("state");
	const realmId = url.searchParams.get("realmId");
	const cookieStore = await cookies();
	const expected = cookieStore.get("qbo_oauth_state")?.value;
	if (!code || !state || !realmId || !expected || state !== expected) {
		return NextResponse.redirect(
			new URL("/admin/clients/new?error=oauth_state", req.url),
		);
	}
	cookieStore.delete("qbo_oauth_state");
	let tokens: { refreshToken: string; realmId: string };
	try {
		tokens = await exchangeAuthorizationCode(code, realmId);
	} catch (e) {
		const msg = e instanceof Error ? e.message : "oauth_failed";
		return NextResponse.redirect(
			new URL(`/admin/clients/new?error=${encodeURIComponent(msg)}`, req.url),
		);
	}
	const env = getEnv();
	const id = createId();
	const name = `Company ${realmId}`;
	await db.insert(clients).values({
		id,
		orgId,
		name,
		realmId: tokens.realmId,
		environment: env.QUICKBOOKS_DEFAULT_ENVIRONMENT,
		encryptedRefreshToken: encryptRefreshToken(tokens.refreshToken),
		tokenUpdatedAt: new Date(),
		createdAt: new Date(),
	});
	await db.insert(clientMembers).values({
		id: createId(),
		clientId: id,
		userId: session.user.id,
		role: "admin",
	});
	return NextResponse.redirect(new URL(`/clients/${id}`, req.url));
}
