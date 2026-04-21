import { createHash } from "node:crypto";
import * as ed from "@noble/ed25519";
import { z } from "zod";
import { getEnv } from "@/lib/env";

const claimsSchema = z.object({
	orgName: z.string(),
	plan: z.string(),
	issuedAt: z.number(),
	expiresAt: z.number().optional(),
	maxClients: z.number().default(10),
});

export type LicenseClaims = z.infer<typeof claimsSchema>;

function decodeBase64Url(s: string): Uint8Array {
	const pad = "=".repeat((4 - (s.length % 4)) % 4);
	const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
	return Uint8Array.from(Buffer.from(b64, "base64"));
}

export function hashLicenseKey(licenseKey: string): string {
	return createHash("sha256").update(licenseKey, "utf8").digest("hex");
}

export async function verifyLicense(
	licenseKey: string,
): Promise<LicenseClaims> {
	const env = getEnv();
	const trimmed = licenseKey.trim();
	const parts = trimmed.split(".");
	if (parts.length !== 3) {
		const looksLikeBareKeyMaterial =
			trimmed.length > 0 &&
			!trimmed.includes(".") &&
			trimmed.length <= 48;
		throw new Error(
			looksLikeBareKeyMaterial
				? "Invalid license format: paste the full license line from gen-license (three parts separated by dots), not the public key from .env"
				: "Invalid license format: expected header.payload.signature (one line, two dots). Run: PRESENT_DAY_LICENSE_PRIVATE_KEY=… bunx tsx scripts/gen-license.ts \"Your Org\"",
		);
	}
	const [headerB64, payloadB64, sigB64] = parts;
	const signingInput = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
	const sig = decodeBase64Url(sigB64);
	const pub = decodeBase64Url(env.PRESENT_DAY_LICENSE_PUBLIC_KEY);
	const ok = await ed.verifyAsync(sig, signingInput, pub);
	if (!ok) {
		throw new Error("Invalid license signature");
	}
	const payloadJson = Buffer.from(payloadB64, "base64url").toString("utf8");
	const raw = JSON.parse(payloadJson) as unknown;
	const claims = claimsSchema.parse(raw);
	if (claims.expiresAt !== undefined && claims.expiresAt < Date.now()) {
		throw new Error("License expired");
	}
	return claims;
}
