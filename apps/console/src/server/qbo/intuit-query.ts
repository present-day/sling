import "server-only";

/** Shared with QuickBooks Reports API and SQL query API. */
export const QBO_MINOR_VERSION = "65";

export function quickBooksApiOrigin(
	environment: "sandbox" | "production",
): string {
	return environment === "sandbox"
		? "https://sandbox-quickbooks.api.intuit.com"
		: "https://quickbooks.api.intuit.com";
}

function escapeQboQueryLiteral(value: string): string {
	return value.replace(/'/g, "''");
}

export function buildEntityListQuery(options: {
	qboEntity: string;
	filterField?: string;
	searchText?: string;
	limit: number;
}): string {
	const { qboEntity, filterField, searchText, limit } = options;
	const base = `select * from ${qboEntity}`;
	if (searchText?.length && filterField) {
		const lit = escapeQboQueryLiteral(searchText);
		return `${base} where ${filterField} like '%${lit}%' maxresults ${limit}`;
	}
	return `${base} maxresults ${limit}`;
}

export function throwIfQuickBooksFault(payload: unknown): void {
	if (typeof payload !== "object" || payload === null) {
		return;
	}
	const obj = payload as Record<string, unknown>;
	if (!("Fault" in obj) || !obj.Fault) {
		return;
	}
	const fault = obj.Fault as {
		Error?: { Detail?: string; Message?: string }[];
	};
	const msg =
		fault.Error?.[0]?.Detail ??
		fault.Error?.[0]?.Message ??
		JSON.stringify(obj.Fault);
	throw new Error(`QuickBooks API: ${msg}`);
}

export function extractQueryRows(
	payload: unknown,
	entityResponseKey: string,
): unknown[] {
	if (typeof payload !== "object" || payload === null) {
		return [];
	}
	const obj = payload as Record<string, unknown>;
	if ("Fault" in obj && obj.Fault) {
		throwIfQuickBooksFault(payload);
	}
	const qr = obj.QueryResponse as Record<string, unknown> | undefined;
	if (!qr) {
		return [];
	}
	const rows = qr[entityResponseKey];
	if (Array.isArray(rows)) {
		return rows;
	}
	if (rows && typeof rows === "object") {
		return [rows];
	}
	return [];
}

export async function runQuickBooksQuery(options: {
	realmId: string;
	environment: "sandbox" | "production";
	accessToken: string;
	query: string;
}): Promise<unknown> {
	const origin = quickBooksApiOrigin(options.environment);
	const url = new URL(`/v3/company/${options.realmId}/query`, origin);
	url.searchParams.set("query", options.query);
	url.searchParams.set("minorversion", QBO_MINOR_VERSION);
	const res = await fetch(url, {
		headers: {
			Authorization: `Bearer ${options.accessToken}`,
			Accept: "application/json",
		},
	});
	const text = await res.text();
	let json: unknown;
	try {
		json = JSON.parse(text) as unknown;
	} catch {
		throw new Error(`QuickBooks query: invalid JSON (${res.status}): ${text}`);
	}
	if (!res.ok) {
		throw new Error(
			`QuickBooks query failed: ${res.status} ${typeof json === "object" && json !== null ? JSON.stringify(json) : text}`,
		);
	}
	return json;
}
