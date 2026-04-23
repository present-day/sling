import "server-only";

import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { clients } from "@/server/db/schema";
import { refreshQuickBooksAccessToken } from "@/server/qbo/oauth";
import { decryptRefreshToken, encryptRefreshToken } from "@/server/qbo/tokens";

type ClientRow = typeof clients.$inferSelect;

/**
 * Decrypts the stored refresh token, exchanges it for an access token, and
 * persists a new refresh token when Intuit rotates it (required for subsequent refreshes).
 */
export async function getQuickBooksAccessTokenForClient(
	client: ClientRow,
): Promise<string> {
	const refresh = decryptRefreshToken(client.encryptedRefreshToken);
	const { accessToken, refreshToken: nextRefresh } =
		await refreshQuickBooksAccessToken(refresh);
	if (nextRefresh) {
		await db
			.update(clients)
			.set({
				encryptedRefreshToken: encryptRefreshToken(nextRefresh),
				tokenUpdatedAt: new Date(),
			})
			.where(eq(clients.id, client.id));
	}
	return accessToken;
}
