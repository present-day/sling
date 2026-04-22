# Architecture (summary)

The authoritative spec is `PLAN.md` next to this app (`apps/console/PLAN.md` from the monorepo root). The repo is a **Bun workspace** with `apps/console` as the Next.js app. Install and scripts run from the **repository root** unless noted.

## Stack

- **Next.js 16** (App Router) + **tRPC** + **TanStack Query** + **superjson**
- **Better Auth** with organizations plugin; sessions in SQLite
- **Drizzle ORM** + **better-sqlite3** (dev); production can switch to Postgres via `DATABASE_URL`
- **QuickBooks Online**: OAuth (refresh token per client) + Intuit **v3 query** API in `src/server/qbo/`
- **Licensing**: Ed25519-signed license payload verified on org bootstrap (`/api/org/bootstrap`)

## Key paths

| Area | Location |
|------|----------|
| Auth | `src/server/auth`, `src/app/api/auth/[...all]` |
| tRPC | `src/server/trpc`, `src/app/api/trpc/[trpc]` |
| DB schema | `src/server/db/schema.ts`, `src/server/db/auth-schema.ts` |
| QBO HTTP | `src/server/qbo/intuit-query.ts`, `src/server/qbo/entity-list-search.ts` |
| QBO OAuth | `src/server/qbo/oauth.ts`, `src/app/api/qbo/oauth/*` |

## Milestones

Implementation is aligned with `PLAN.md` §15 (M0–M7). Remaining gaps (streaming chat, full report PDF/XLSX, license read-only degradation UI, etc.) are marked with `501` or placeholder copy in code.
