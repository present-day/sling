import path from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { db } from "../src/server/db/client";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

migrate(db, { migrationsFolder: path.join(__dirname, "../drizzle") });
console.log("Migrations applied.");
