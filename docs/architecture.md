# Architecture (summary)

The authoritative spec is `PLAN.md` in the repository root. This document is a short pointer for engineers.

## Stack

- **Next.js 16** (App Router) + **tRPC** + **TanStack Query** + **superjson**
- **Better Auth** with organizations plugin; sessions in SQLite
- **Drizzle ORM** + **better-sqlite3** (dev); production can switch to Postgres via `DATABASE_URL`
- **MCP**: `@modelcontextprotocol/sdk` stdio client; one cached child per QuickBooks client (realm), env-injected tokens
- **Licensing**: Ed25519-signed license payload verified on org bootstrap (`/api/org/bootstrap`)

## Key paths

| Area | Location |
|------|----------|
| Auth | `src/server/auth`, `src/app/api/auth/[...all]` |
| tRPC | `src/server/trpc`, `src/app/api/trpc/[trpc]` |
| DB schema | `src/server/db/schema.ts`, `src/server/db/auth-schema.ts` |
| MCP pool | `src/server/mcp/pool.ts` |
| QBO OAuth | `src/server/qbo/oauth.ts`, `src/app/api/qbo/oauth/*` |

## Milestones

Implementation is aligned with `PLAN.md` §15 (M0–M7). Remaining gaps (streaming chat, full report PDF/XLSX, license read-only degradation UI, etc.) are marked with `501` or placeholder copy in code.
