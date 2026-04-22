import "server-only";
import {
	ENTITY_QBO_QUERY_ENTITY,
	ENTITY_SEARCH_QUERY_KEY,
} from "@/lib/entity-search";
import type { clients } from "@/server/db/schema";
import {
	buildEntityListQuery,
	extractQueryRows,
	runQuickBooksQuery,
} from "@/server/qbo/intuit-query";
import { refreshQuickBooksAccessToken } from "@/server/qbo/oauth";
import { decryptRefreshToken } from "@/server/qbo/tokens";

type ClientRow = typeof clients.$inferSelect;

export async function searchQboEntityList(
	client: ClientRow,
	entityStem: string,
	textFilter: string | undefined,
	limit: number,
): Promise<unknown[]> {
	const qboEntity = ENTITY_QBO_QUERY_ENTITY[entityStem];
	if (!qboEntity) {
		throw new Error(`Unknown QuickBooks entity stem: ${entityStem}`);
	}

	const q = textFilter?.trim();
	const refresh = decryptRefreshToken(client.encryptedRefreshToken);
	const { accessToken } = await refreshQuickBooksAccessToken(refresh);

	let sql: string;
	if (entityStem === "accounts") {
		sql = buildEntityListQuery({
			qboEntity,
			filterField: q ? "Name" : undefined,
			searchText: q,
			limit,
		});
	} else if (entityStem === "attachables") {
		sql = buildEntityListQuery({
			qboEntity,
			filterField: q ? "FileName" : undefined,
			searchText: q,
			limit,
		});
	} else {
		const field = ENTITY_SEARCH_QUERY_KEY[entityStem] ?? "DisplayName";
		sql = buildEntityListQuery({
			qboEntity,
			filterField: q ? field : undefined,
			searchText: q,
			limit,
		});
	}

	const raw = await runQuickBooksQuery({
		realmId: client.realmId,
		environment: client.environment,
		accessToken,
		query: sql,
	});

	return extractQueryRows(raw, qboEntity);
}
