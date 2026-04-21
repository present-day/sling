# ZeroCool Console

Source-available bookkeeping cockpit (MVP scaffold per `PLAN.md`). **Not open source** — see `LICENSE`.

## Prerequisites

- [Bun](https://bun.sh/) and Node.js (for `better-sqlite3` migrations via `tsx`)
- Intuit Developer sandbox app (client id / secret)
- Optional: [Intuit QuickBooks MCP server](https://github.com/intuit/quickbooks-online-mcp-server) built locally; set `MCP_QBO_SERVER_PATH`
- Anthropic API key (for chat features when wired)

## Quick start

1. Copy `.env.example` to `.env.local` and fill values:
   - `BETTER_AUTH_SECRET`: 32+ random bytes (hex or long string)
   - `TOKEN_ENCRYPTION_KEY`: 64 hex chars (32 bytes) for AES-256-GCM token storage
   - `PRESENT_DAY_LICENSE_PUBLIC_KEY`: base64url Ed25519 public key (use `bunx tsx scripts/gen-keys.ts`)
2. Generate a dev license (requires private key locally, **never commit**):

   ```bash
   PRESENT_DAY_LICENSE_PRIVATE_KEY="<from gen-keys>" bunx tsx scripts/gen-license.ts "My Firm"
   ```

3. Create the SQLite DB and apply migrations:

   ```bash
   mkdir -p .data
   bun run db:migrate
   ```

4. Run the app:

   ```bash
   bun dev
   ```

5. Sign up, then on **Activate organization** paste the license key from step 2.

6. Connect QuickBooks: **Clients → Add client** (or `/admin/clients/new`) and complete Intuit OAuth.

### CI / build without real secrets

```bash
SKIP_ENV_VALIDATION=true bun run build
```

## Scripts

| Script | Purpose |
|--------|---------|
| `bun run db:migrate` | Apply Drizzle migrations (uses Node + `tsx` for `better-sqlite3`) |
| `bun run db:generate` | `drizzle-kit generate` new migration |
| `bunx tsx scripts/gen-keys.ts` | Print Ed25519 keypair for license signing (dev) |
| `bunx tsx scripts/gen-license.ts` | Sign a license JWT-like blob |
| `bunx tsx scripts/verify-mcp.ts` | Smoke-test MCP server spawn (requires QBO env vars) |

## Architecture

See `docs/architecture.md` and `PLAN.md` for the full product spec. This repo implements the stack (Next.js 16, tRPC, Better Auth, Drizzle/SQLite, MCP client pool) with routes and stubs where noted in code comments.
