/**
 * Signs a license key (Ed25519). Requires PRESENT_DAY_LICENSE_PRIVATE_KEY:
 * base64/base64url (from scripts/gen-keys.ts) or 64-character hex (32-byte seed).
 * Usage: PRESENT_DAY_LICENSE_PRIVATE_KEY=... bunx tsx scripts/gen-license.ts "Org Name"
 */
import { signLicense } from "../src/server/license/sign"

async function main() {
	const orgName = process.argv[2] ?? "Demo Org"
	const privateKey = process.env.PRESENT_DAY_LICENSE_PRIVATE_KEY
	if (!privateKey) {
		throw new Error(
			"Set PRESENT_DAY_LICENSE_PRIVATE_KEY (base64url or 64-char hex secret key)",
		)
	}
	const now = Date.now()
	const exp = now + 365 * 24 * 60 * 60 * 1000
	const key = await signLicense(
		{
			orgName,
			plan: "mvp",
			issuedAt: now,
			expiresAt: exp,
			maxClients: 10,
		},
		privateKey,
	)
	console.log(key)
}

void main()
