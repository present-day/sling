import { getEnv } from "@/lib/env"

async function normalizedOAuthError(res: Response): Promise<string> {
	const text = await res.text().catch(() => "")
	let code = "unknown_error"
	try {
		const parsed = JSON.parse(text) as {
			error?: unknown
			error_description?: unknown
		}
		if (typeof parsed.error === "string") code = parsed.error
		else if (typeof parsed.error_description === "string")
			code = parsed.error_description
	} catch {
		// Non-JSON body — keep "unknown_error" so we never leak raw upstream text.
	}
	return `${res.status} (${code})`
}

export function buildQuickBooksAuthorizeUrl(state: string): string {
	const env = getEnv()
	const params = new URLSearchParams({
		client_id: env.QUICKBOOKS_CLIENT_ID,
		response_type: "code",
		scope: "com.intuit.quickbooks.accounting",
		redirect_uri: env.QUICKBOOKS_REDIRECT_URI,
		state,
	})
	return `https://appcenter.intuit.com/connect/oauth2?${params.toString()}`
}

export async function exchangeAuthorizationCode(code: string, realmId: string) {
	const env = getEnv()
	const body = new URLSearchParams({
		grant_type: "authorization_code",
		code,
		redirect_uri: env.QUICKBOOKS_REDIRECT_URI,
	})
	const auth = Buffer.from(
		`${env.QUICKBOOKS_CLIENT_ID}:${env.QUICKBOOKS_CLIENT_SECRET}`,
	).toString("base64")
	const res = await fetch(
		"https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
		{
			method: "POST",
			headers: {
				Authorization: `Basic ${auth}`,
				"Content-Type": "application/x-www-form-urlencoded",
				Accept: "application/json",
			},
			body,
		},
	)
	if (!res.ok) {
		throw new Error(`Token exchange failed: ${await normalizedOAuthError(res)}`)
	}
	const json = (await res.json()) as {
		refresh_token?: string
		x_refresh_token_expires_in?: number
	}
	if (!json.refresh_token) {
		throw new Error("Missing refresh_token in token response")
	}
	return {
		refreshToken: json.refresh_token,
		realmId,
	}
}

export async function refreshQuickBooksAccessToken(
	refreshToken: string,
): Promise<{
	accessToken: string
	refreshToken?: string
}> {
	const env = getEnv()
	const body = new URLSearchParams({
		grant_type: "refresh_token",
		refresh_token: refreshToken,
	})
	const auth = Buffer.from(
		`${env.QUICKBOOKS_CLIENT_ID}:${env.QUICKBOOKS_CLIENT_SECRET}`,
	).toString("base64")
	const res = await fetch(
		"https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
		{
			method: "POST",
			headers: {
				Authorization: `Basic ${auth}`,
				"Content-Type": "application/x-www-form-urlencoded",
				Accept: "application/json",
			},
			body,
		},
	)
	if (!res.ok) {
		throw new Error(
			`QuickBooks token refresh failed: ${await normalizedOAuthError(res)}`,
		)
	}
	const json = (await res.json()) as {
		access_token?: string
		refresh_token?: string
	}
	if (!json.access_token) {
		throw new Error("Missing access_token in refresh response")
	}
	return {
		accessToken: json.access_token,
		...(json.refresh_token ? { refreshToken: json.refresh_token } : {}),
	}
}
