/**
 * Generate Ed25519 keypair for license signing (dev). Prints base64url lines for .env.
 * Usage: bunx tsx scripts/gen-keys.ts
 */
import * as ed from "@noble/ed25519"

function toUrl(b: Uint8Array): string {
	return Buffer.from(b)
		.toString("base64")
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "")
}

async function main() {
	const { secretKey, publicKey } = await ed.keygenAsync()
	console.log(`PRESENT_DAY_LICENSE_PRIVATE_KEY=${toUrl(secretKey)}`)
	console.log(`PRESENT_DAY_LICENSE_PUBLIC_KEY=${toUrl(publicKey)}`)
}

void main()
