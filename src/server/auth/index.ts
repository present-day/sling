import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { nextCookies } from "better-auth/next-js"
import { organization } from "better-auth/plugins"
import { getEnv } from "@/lib/env"
import { db } from "@/server/db/client"
import { schema } from "@/server/db/schema"

function buildAuth() {
	const env = getEnv()
	return betterAuth({
		baseURL: env.BETTER_AUTH_URL,
		secret: env.BETTER_AUTH_SECRET,
		trustedOrigins: [env.NEXT_PUBLIC_APP_URL],
		database: drizzleAdapter(db, {
			provider: "sqlite",
			schema,
		}),
		emailAndPassword: {
			enabled: true,
		},
		plugins: [nextCookies(), organization()],
		experimental: {
			joins: true,
		},
	})
}

export const auth = buildAuth()
