# ZeroCool console (monorepo)

Bun workspace containing the **Next.js console** app. QuickBooks Online is integrated **directly** via Intuit’s REST API (OAuth refresh token stored per client).

The **QuickBooks MCP server** is maintained **outside** this repository for Cursor IDE use only: build `dist/index.js` in that project and point Cursor’s MCP settings at it with your sandbox Intuit credentials when you want tool discovery while implementing new endpoints.

## Layout

| Path | Package | Role |
|------|---------|------|
| `apps/console` | `zerocool-console` | Next.js 16 app (UI, tRPC, auth, QBO HTTP client) |

## Cursor MCP (optional, local dev)

1. Clone or create a repo that contains the QBO MCP server (e.g. fork or copy from [intuit/quickbooks-online-mcp-server](https://github.com/intuit/quickbooks-online-mcp-server)), run `npm install` and `npm run build`, and note the absolute path to `dist/index.js`.
2. In Cursor, add an MCP server entry, for example:
   - **Command:** `node`
   - **Args:** `["/absolute/path/to/qbo-mcp-server/dist/index.js"]`
   - **Env:** `QUICKBOOKS_CLIENT_ID`, `QUICKBOOKS_CLIENT_SECRET`, `QUICKBOOKS_REFRESH_TOKEN`, `QUICKBOOKS_REALM_ID`, `QUICKBOOKS_ENVIRONMENT` (`sandbox` or `production`)

The console app does **not** spawn this process; it only uses the same Intuit app credentials in `.env.local` for OAuth and API calls.

## Prerequisites

- [Bun](https://bun.sh) 1.x

## Install & run (development)

From the **repository root**:

```bash
bun install
cp apps/console/.env.example apps/console/.env.local
# edit apps/console/.env.local
bun run dev
```

The app serves at `http://localhost:3000` (see `apps/console` for app-specific docs).

## Production-style build

```bash
bun install
bun run build
```

This builds the Next app only.

## Deploying

- **Vercel / similar:** set **Root Directory** to `apps/console` and configure env vars there. No MCP binary is required at runtime.
- **Docker:** build from `apps/console` with Bun/Node as appropriate for your stack.
