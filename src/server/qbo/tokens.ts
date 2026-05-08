import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"
import { getEnv } from "@/lib/env"

function keyBuffer(): Buffer {
	return Buffer.from(getEnv().TOKEN_ENCRYPTION_KEY, "hex")
}

export function encryptRefreshToken(plaintext: string): string {
	const key = keyBuffer()
	const iv = randomBytes(12)
	const cipher = createCipheriv("aes-256-gcm", key, iv)
	const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
	const tag = cipher.getAuthTag()
	return Buffer.concat([iv, tag, enc]).toString("base64")
}

export function decryptRefreshToken(ciphertext: string): string {
	const buf = Buffer.from(ciphertext, "base64")
	const iv = buf.subarray(0, 12)
	const tag = buf.subarray(12, 28)
	const enc = buf.subarray(28)
	const key = keyBuffer()
	const decipher = createDecipheriv("aes-256-gcm", key, iv)
	decipher.setAuthTag(tag)
	return decipher.update(enc) + decipher.final("utf8")
}
