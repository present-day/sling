import { z } from "zod";

const envSchema = z
	.object({
		NODE_ENV: z
			.enum(["development", "production", "test"])
			.default("development"),
		NEXT_PUBLIC_APP_URL: z.string().url(),
		BETTER_AUTH_SECRET: z.string().min(32),
		BETTER_AUTH_URL: z.string().url(),
		DATABASE_URL: z.string().min(1),
		TOKEN_ENCRYPTION_KEY: z.string().regex(/^[0-9a-fA-F]{64}$/),
		QUICKBOOKS_CLIENT_ID: z.string().min(1),
		QUICKBOOKS_CLIENT_SECRET: z.string().min(1),
		/** If unset, defaults to {NEXT_PUBLIC_APP_URL}/api/qbo/oauth/callback (must match Intuit Developer → Settings → Redirect URIs exactly). */
		QUICKBOOKS_REDIRECT_URI: z.string().url().optional(),
		QUICKBOOKS_DEFAULT_ENVIRONMENT: z
			.enum(["sandbox", "production"])
			.default("sandbox"),
		MCP_QBO_SERVER_PATH: z.string().min(1),
		ANTHROPIC_API_KEY: z.string().min(1),
		PRESENT_DAY_LICENSE_PUBLIC_KEY: z.string().min(1),
	})
	.transform((d) => ({
		...d,
		QUICKBOOKS_REDIRECT_URI:
			d.QUICKBOOKS_REDIRECT_URI?.trim() ||
			new URL("/api/qbo/oauth/callback", d.NEXT_PUBLIC_APP_URL).href,
	}));

export type Env = z.infer<typeof envSchema>;

function buildPlaceholderEnv(): Env {
	return {
		NODE_ENV: "development",
		NEXT_PUBLIC_APP_URL: "http://localhost:3000",
		BETTER_AUTH_SECRET: "0".repeat(32),
		BETTER_AUTH_URL: "http://localhost:3000",
		DATABASE_URL: "file:./.data/console.db",
		TOKEN_ENCRYPTION_KEY: "0".repeat(64),
		QUICKBOOKS_CLIENT_ID: "placeholder",
		QUICKBOOKS_CLIENT_SECRET: "placeholder",
		QUICKBOOKS_REDIRECT_URI: "http://localhost:3000/api/qbo/oauth/callback",
		QUICKBOOKS_DEFAULT_ENVIRONMENT: "sandbox",
		MCP_QBO_SERVER_PATH: "/dev/null",
		ANTHROPIC_API_KEY: "placeholder",
		PRESENT_DAY_LICENSE_PUBLIC_KEY: "placeholder",
	};
}

export function getEnv(): Env {
	if (process.env.SKIP_ENV_VALIDATION === "true") {
		return buildPlaceholderEnv();
	}
	const parsed = envSchema.safeParse(process.env);
	if (!parsed.success) {
		console.error("Invalid environment:", parsed.error.flatten().fieldErrors);
		throw new Error("Invalid environment variables");
	}
	return parsed.data;
}
