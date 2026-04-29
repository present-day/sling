import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as {
	sqlite?: Database.Database;
	db?: ReturnType<typeof drizzle<typeof schema>>;
};

function databasePath() {
	const url = process.env.DATABASE_URL ?? "file:./.data/console.db";
	return url.replace(/^file:/, "");
}

function createDb() {
	const sqlite = globalForDb.sqlite ?? new Database(databasePath());
	const db = globalForDb.db ?? drizzle(sqlite, { schema });
	if (process.env.NODE_ENV !== "production") {
		globalForDb.sqlite = sqlite;
		globalForDb.db = db;
	}
	return db;
}

export const db = createDb();
