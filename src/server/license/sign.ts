import { createHash } from "node:crypto"
import * as ed from "@noble/ed25519"
import type { LicenseClaims } from "./verify"

function encodeBase64Url(buf: Uint8Array): string {
	return Buffer.from(buf)
		.toString("base64")
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "")
}

const HEX_SECRET_KEY = /^[0-9a-fA-F]{64}$/

function decodeEd25519SecretKey(material: string): Uint8Array {
	const key = material.trim()
	if (HEX_SECRET_KEY.test(key)) {
		return Uint8Array.from(Buffer.from(key, "hex"))
	}
	const pad = "=".repeat((4 - (key.length % 4)) % 4)
	const b64 = key.replace(/-/g, "+").replace(/_/g, "/") + pad
	return Uint8Array.from(Buffer.from(b64, "base64"))
}

export async function signLicense(
	claims: LicenseClaims,
	privateKeyBase64Url: string,
): Promise<string> {
	const header = { alg: "EdDSA", typ: "JWT" }
	const headerB64 = encodeBase64Url(
		new TextEncoder().encode(JSON.stringify(header)),
	)
	const payloadB64 = encodeBase64Url(
		new TextEncoder().encode(JSON.stringify(claims)),
	)
	const signingInput = new TextEncoder().encode(`${headerB64}.${payloadB64}`)
	const sk = decodeEd25519SecretKey(privateKeyBase64Url)
	if (sk.length !== 32) {
		throw new Error(
			"Ed25519 secret key must be 32 bytes (use 64-char hex or base64/base64url from scripts/gen-keys.ts)",
		)
	}
	const sig = await ed.signAsync(signingInput, sk)
	const sigB64 = encodeBase64Url(sig)
	return `${headerB64}.${payloadB64}.${sigB64}`
}

export function hashLicenseKey(licenseKey: string): string {
	return createHash("sha256").update(licenseKey, "utf8").digest("hex")
}
