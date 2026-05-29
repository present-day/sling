/**
 * Deactivate orphaned duplicate vendors in a client's QuickBooks Online realm.
 *
 * Duplicates happen when a "create new" ref resolution succeeds but the parent
 * transaction (e.g. a Bill) then fails to post — the vendor is left stranded,
 * and a retry can mint another. `createStub` is now idempotent so new dupes
 * shouldn't appear, but this cleans up ones already in the sandbox.
 *
 * Groups active vendors by normalized DisplayName, keeps the lowest QBO Id in
 * each group (the canonical/oldest), and marks the rest inactive. QBO never
 * hard-deletes name-list records; inactive is the closest thing.
 *
 *   bun run db:dedupe-vendors <clientId>           # dry run (default)
 *   bun run db:dedupe-vendors <clientId> --apply   # actually deactivate
 *
 * Runs under tsx (better-sqlite3 isn't supported in the Bun runtime). The
 * `--conditions=react-server` node flag in the package.json script makes the
 * `server-only` marker resolve to its empty stub so the QBO modules import.
 */

import { config } from "dotenv"

// Load secrets the same way `next dev` does, before importing any module that
// reads env at import time (db client, token decrypt, OAuth refresh).
config({ path: ".env.local" })

type VendorRow = {
	Id: string
	DisplayName: string
	SyncToken: string
	Active?: boolean
}

async function main(): Promise<void> {
	const clientId = process.argv[2]
	const apply = process.argv.includes("--apply")

	if (!clientId || clientId.startsWith("--")) {
		console.error("Usage: bun run db:dedupe-vendors <clientId> [--apply]")
		process.exit(1)
	}

	const { eq } = await import("drizzle-orm")
	const { db } = await import("../src/server/db/client")
	const { clients } = await import("../src/server/db/schema")
	const { makeIntuitClient } = await import("../src/server/qbo/intuit-client")

	const client = await db.query.clients.findFirst({
		where: eq(clients.id, clientId),
	})
	if (!client) {
		console.error(`No client with id "${clientId}" in this database.`)
		process.exit(1)
	}

	console.log(
		`Client "${client.name}" · realm ${client.realmId} · ${client.environment}${
			apply ? "" : " · DRY RUN (pass --apply to deactivate)"
		}\n`,
	)

	const intuit = makeIntuitClient(client)

	const res = await intuit.queryEntity<{
		QueryResponse?: { Vendor?: VendorRow[] }
	}>(
		"SELECT Id, DisplayName, SyncToken, Active FROM Vendor WHERE Active = true MAXRESULTS 1000",
	)
	const vendors = res.QueryResponse?.Vendor ?? []

	// Group active vendors by normalized name; only groups with 2+ are dupes.
	const groups = new Map<string, VendorRow[]>()
	for (const v of vendors) {
		const key = v.DisplayName.trim().replace(/\s+/g, " ").toLowerCase()
		const list = groups.get(key) ?? []
		list.push(v)
		groups.set(key, list)
	}

	const byNumericId = (a: VendorRow, b: VendorRow) =>
		Number(a.Id) - Number(b.Id)
	let deactivated = 0
	let dupeGroups = 0

	for (const [, list] of groups) {
		if (list.length < 2) continue
		dupeGroups++
		const sorted = [...list].sort(byNumericId)
		const keep = sorted[0]
		const drop = sorted.slice(1)
		console.log(
			`"${keep?.DisplayName}" — keeping id ${keep?.Id}, deactivating ${drop
				.map((d) => `id ${d.Id}`)
				.join(", ")}`,
		)
		if (!apply) continue
		for (const v of drop) {
			try {
				await intuit.createEntity("vendor", {
					Id: v.Id,
					SyncToken: v.SyncToken,
					sparse: true,
					Active: false,
				})
				deactivated++
			} catch (e) {
				console.error(
					`  ! failed to deactivate id ${v.Id}: ${
						e instanceof Error ? e.message : String(e)
					}`,
				)
			}
		}
	}

	if (dupeGroups === 0) {
		console.log("No duplicate active vendors found. Nothing to do.")
	} else if (apply) {
		console.log(`\nDeactivated ${deactivated} duplicate vendor(s).`)
	} else {
		console.log("\nDry run only — re-run with --apply to deactivate.")
	}

	process.exit(0)
}

main().catch((e) => {
	console.error(e instanceof Error ? e.message : e)
	process.exit(1)
})
