import { createId } from "@paralleldrive/cuid2";
import { NextResponse } from "next/server";
import { z } from "zod";
import { slugify } from "@/lib/slug";
import { auth } from "@/server/auth";
import { db } from "@/server/db/client";
import { licenses } from "@/server/db/schema";
import { hashLicenseKey, verifyLicense } from "@/server/license/verify";

const bodySchema = z.object({
	organizationName: z.string().min(1),
	licenseKey: z.string().min(1),
});

export async function POST(req: Request) {
	const session = await auth.api.getSession({ headers: req.headers });
	if (!session?.user) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}
	const json: unknown = await req.json();
	const parsed = bodySchema.safeParse(json);
	if (!parsed.success) {
		return NextResponse.json({ error: "Invalid body" }, { status: 400 });
	}
	let claims: Awaited<ReturnType<typeof verifyLicense>>;
	try {
		claims = await verifyLicense(parsed.data.licenseKey);
	} catch (e) {
		const message = e instanceof Error ? e.message : "Invalid license";
		return NextResponse.json({ error: message }, { status: 400 });
	}
	const slug = `${slugify(parsed.data.organizationName)}-${createId().slice(0, 8)}`;
	const created = await auth.api.createOrganization({
		body: {
			name: parsed.data.organizationName,
			slug,
			logo: undefined,
			metadata: { licenseOrgName: claims.orgName },
		},
		headers: req.headers,
	});
	const orgId =
		created &&
		typeof created === "object" &&
		"id" in created &&
		typeof (created as { id: unknown }).id === "string"
			? (created as { id: string }).id
			: null;
	if (!orgId) {
		return NextResponse.json(
			{ error: "Organization creation failed" },
			{ status: 500 },
		);
	}
	await db.insert(licenses).values({
		id: createId(),
		orgId,
		keyHash: hashLicenseKey(parsed.data.licenseKey),
		plan: claims.plan,
		issuedAt: new Date(claims.issuedAt),
		expiresAt: claims.expiresAt ? new Date(claims.expiresAt) : null,
		maxClients: claims.maxClients,
	});
	await auth.api.setActiveOrganization({
		body: { organizationId: orgId },
		headers: req.headers,
	});
	return NextResponse.json({ ok: true as const, organizationId: orgId });
}
