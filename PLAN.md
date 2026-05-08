# ZeroCool Console — MVP Build Plan

> **Audience:** Claude Code (implementation agent) + engineers picking this up later.
> **Author:** Joe (Present Day Inc.) — April 2026.
> **Goal of this doc:** A single, self-contained spec Claude Code can execute top-to-bottom to deliver a runnable MVP on Joe's local machine, connected to his Intuit Sandbox.

> **Note (implementation, April 2026):** The QuickBooks MCP server is **not** vendored in this monorepo anymore. Runtime integration uses the **Accounting API** directly (`apps/console/src/server/qbo/`). Sections below that describe `src/server/mcp/pool.ts`, `MCP_QBO_SERVER_PATH`, or in-app Tool Explorer are **obsolete**; keep an MCP checkout elsewhere for Cursor-only discovery if you want.
>
> **Note (strategy, May 2026):** Intuit + Anthropic announced a direct partnership ([intuit.com/anthropic/](https://www.intuit.com/anthropic/)). QuickBooks, TurboTax, Credit Karma, and Mailchimp now ship as **first-party MCP integrations inside Claude** — individual QBO orgs can already "ask Claude about my books" with no third party. This re-frames Sling's wedge: **drop the "talk to your books in Claude" framing**; lead with **multi-client bookkeeper cockpit + AI document ingestion** (drag-drop classifier, scoped per-tab chat). The Sling-as-MCP-server track (issues #33–#44) stays — its differentiator is now multi-org / multi-client / write-confirmation gates, not the existence of MCP itself. Marketplace listing via the Intuit App Partner Program is a post-MVP track (separate discovery issue). This whole document is being rewritten for the cockpit pivot in #20; this note is a placeholder until that lands.

---

## 1. Executive Summary

**Console** is the proof-of-concept bookkeeping cockpit for the ZeroCool product line. It is an AI-native, multi-tenant web app that sits in front of QuickBooks Online via the official Intuit QuickBooks MCP server. The MVP ships locally (no cloud dependencies, no paid SaaS services required beyond an Intuit Developer sandbox and an Anthropic API key) and is architected so the same codebase scales into a sellable multi-tenant product — either direct-to-SMB or white-labelled to other bookkeepers.

The MVP must demonstrate four things in order:

1. **Every** MCP tool the Intuit server exposes (143 tools across 29 entities + 11 reports) has a visible entry point in the UI.
2. Two distinct AI chat experiences — one for admin/bookkeeper use, one for client self-service — both streaming, tool-using, and properly scoped.
3. Template-driven reports (P&L, Balance Sheet, Cash Flow, etc.) that render live from QuickBooks and download as PDF or XLSX.
4. A multi-tenant data model and license-gated bootstrap, so the same build can be stood up for a second bookkeeper without forking the code.

Design target: feel as modern as Zeni and Custombooks — clean, generous whitespace, data-dense but legible, dark-mode by default, keyboard-driven.

---

## 2. Goals and Non-Goals

### In scope for the MVP

- Local development against Joe's Intuit Sandbox realm.
- Full coverage of the Intuit QuickBooks MCP server toolset in the UI.
- Admin chat (acts across any connected client) and Client chat (scoped to one tenant).
- Template-based report generator with PDF and XLSX export.
- BetterAuth-backed multi-tenancy (Organizations → Clients → Users) with role-based access.
- License-key gating on organization bootstrap so the product is not freely redistributable.
- Basic white-label (logo, product name, primary color per org).

### Explicitly out of scope for the MVP

- Production-grade OAuth flows for many real QuickBooks companies (we'll wire the flow but test against sandbox only).
- Billing/subscriptions (Stripe wiring can come later).
- Background job workers, email, notifications.
- Mobile app / native shell.
- A marketing site.

### Design non-negotiables

- Every MCP tool is reachable from the UI, not just the chat.
- No hard-coded tenant IDs anywhere after milestone M1.
- Zod schemas are the single source of truth for validation (tRPC inputs, TanStack Form, MCP tool args).
- The system must run with `bun dev` and nothing else once `.env` is filled in.

---

## 3. High-Level Architecture

```
                       ┌─────────────────────────────┐
                       │  Browser (Next.js App)      │
                       │  - shadcn/ui + Tailwind     │
                       │  - TanStack Form + Query    │
                       │  - nuqs for URL state       │
                       └──────────────┬──────────────┘
                                      │  tRPC over HTTP (superjson)
                       ┌──────────────▼──────────────┐
                       │  Next.js Route Handlers     │
                       │  - tRPC routers             │
                       │  - AI SDK chat endpoints    │
                       │  - Report render endpoints  │
                       └──────┬────────────┬─────────┘
                              │            │
             ┌────────────────▼─┐      ┌───▼────────────────────┐
             │  BetterAuth      │      │  MCP Client (server)   │
             │  - sessions      │      │  - spawns MCP child    │
             │  - orgs/tenants  │      │  - routes tool calls   │
             │  - RBAC          │      │    by active realm     │
             └────────┬─────────┘      └─────────┬──────────────┘
                      │                          │ stdio
                      │                ┌─────────▼─────────────┐
                      │                │ Intuit QuickBooks     │
                      │                │ MCP Server (Node)     │
                      │                │ 143 tools, 11 reports │
                      │                └─────────┬─────────────┘
                      │                          │ HTTPS + OAuth2
                      │                ┌─────────▼─────────────┐
                      │                │ QuickBooks Online API │
                      │                │ (Intuit Sandbox/Prod) │
                      │                └───────────────────────┘
                      │
             ┌────────▼──────────┐
             │ SQLite + Drizzle  │  (dev) → Postgres (prod later)
             │  users, orgs,     │
             │  clients, tokens, │
             │  templates, etc.  │
             └───────────────────┘
```

Two processes run on `bun dev`:

1. The **Next.js app** (UI + API + BetterAuth + MCP client).
2. One or more **QuickBooks MCP server** children, spawned per connected client (realm). We connect stdio to each child and cache the handle.

---

## 4. Tech Stack (locked for MVP)

| Layer           | Choice                                                  | Why                                                                            |
| --------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Framework       | **Next.js 16 (App Router, RSC)**                        | Mature, best shadcn + tRPC examples, easy to deploy later                      |
| Package manager | **bun**                                                 | Fast, workspace-friendly                                                       |
| Styling         | **Tailwind CSS v4** + **shadcn/ui**                     | Matches the visual target (Zeni/Custombooks) with minimal effort               |
| Forms           | **TanStack Form** + **Zod** resolver                    | Type-safe, headless, no react-hook-form lock-in                                |
| Data fetching   | **TanStack Query** (wraps tRPC)                         | Stale-while-revalidate, devtools, easy mutations                               |
| API             | **tRPC v11** (App Router adapter) + superjson           | End-to-end types without codegen                                               |
| URL state       | **nuqs**                                                | For filter bars, date ranges, report params                                    |
| Validation      | **Zod**                                                 | Single source of truth                                                         |
| Auth            | **BetterAuth** (self-hosted) + **organizations** plugin | Free, multi-tenant primitive, no vendor lock-in                                |
| DB (dev)        | **SQLite** via `better-sqlite3` + **Drizzle ORM**       | Zero-install local; migration path to Postgres is one connection string change |
| AI              | **Vercel AI SDK (`ai` v4)** with `@ai-sdk/anthropic`    | Streaming, tool-calling, first-class MCP support                               |
| MCP client      | **`@modelcontextprotocol/sdk`** (TypeScript)            | Official client, talks stdio to the Intuit server                              |
| PDF             | **`@react-pdf/renderer`**                               | Render report templates with React components                                  |
| XLSX            | **`exceljs`**                                           | Full-featured, supports styling and formulas                                   |
| Icons           | **lucide-react**                                        | Ships with shadcn                                                              |
| Lint / format   | **Biome**                                               | Fast, one tool for both                                                        |
| Tests           | **Vitest** + **Playwright**                             | Unit + a handful of smoke E2E                                                  |

---

## 5. Repository Layout

Single repo, no monorepo for MVP. Keep the door open for a `packages/` split later.

```
console/
├── .env.example
├── .env.local                       # gitignored
├── LICENSE                          # see §13 — proprietary
├── README.md                        # minimal: how to run
├── biome.json
├── drizzle.config.ts
├── next.config.ts
├── package.json
├── bun.lockb
├── tailwind.config.ts
├── tsconfig.json
├── docs/
│   ├── architecture.md              # this plan, trimmed
│   ├── licensing.md                 # §13 details
│   └── mcp-tool-map.md              # §9 rendered as reference
├── drizzle/                          # generated migrations
├── scripts/
│   ├── gen-license.ts               # signs a license with our private key
│   ├── bootstrap-sandbox.ts         # first-run seed for Joe's realm
│   └── verify-mcp.ts                # smoke-tests the MCP child process
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── (marketing)/              # future landing page
│   │   ├── (auth)/
│   │   │   ├── sign-in/
│   │   │   └── sign-up/
│   │   ├── (app)/                    # authenticated shell
│   │   │   ├── layout.tsx            # sidebar + topbar
│   │   │   ├── dashboard/
│   │   │   ├── clients/              # admin: list of connected clients
│   │   │   ├── clients/[clientId]/   # per-client workspace
│   │   │   │   ├── overview/
│   │   │   │   ├── customers/
│   │   │   │   ├── vendors/
│   │   │   │   ├── invoices/
│   │   │   │   ├── bills/
│   │   │   │   ├── payments/
│   │   │   │   ├── deposits/
│   │   │   │   ├── transfers/
│   │   │   │   ├── estimates/
│   │   │   │   ├── sales-receipts/
│   │   │   │   ├── credit-memos/
│   │   │   │   ├── refund-receipts/
│   │   │   │   ├── purchase-orders/
│   │   │   │   ├── vendor-credits/
│   │   │   │   ├── purchases/
│   │   │   │   ├── journal-entries/
│   │   │   │   ├── time-activities/
│   │   │   │   ├── attachables/
│   │   │   │   ├── accounts/
│   │   │   │   ├── classes/
│   │   │   │   ├── departments/
│   │   │   │   ├── settings/
│   │   │   │   │   ├── terms/
│   │   │   │   │   ├── payment-methods/
│   │   │   │   │   ├── tax/
│   │   │   │   │   └── company-info/
│   │   │   │   ├── reports/
│   │   │   │   │   └── [template]/   # renders a template live
│   │   │   │   └── chat/             # client-scoped chat
│   │   │   ├── admin/
│   │   │   │   ├── chat/             # cross-client admin chat
│   │   │   │   ├── organization/     # org settings, license, branding
│   │   │   │   └── users/
│   │   ├── api/
│   │   │   ├── trpc/[trpc]/route.ts
│   │   │   ├── auth/[...all]/route.ts         # BetterAuth
│   │   │   ├── chat/admin/route.ts            # AI SDK admin agent
│   │   │   ├── chat/client/[clientId]/route.ts # AI SDK client agent
│   │   │   ├── reports/[clientId]/[template]/render/route.ts # HTML
│   │   │   ├── reports/[clientId]/[template]/pdf/route.ts
│   │   │   ├── reports/[clientId]/[template]/xlsx/route.ts
│   │   │   └── qbo/oauth/callback/route.ts    # QuickBooks OAuth return
│   ├── components/
│   │   ├── ui/                       # shadcn primitives
│   │   ├── layout/                   # sidebar, topbar, client switcher
│   │   ├── chat/                     # message list, composer, tool-call UI
│   │   ├── data-table/               # shared TanStack-Table wrapper
│   │   ├── forms/                    # Zod-backed form builders
│   │   └── reports/                  # report header, section, KPI tiles
│   ├── server/
│   │   ├── auth/                     # BetterAuth config + org plugin
│   │   ├── db/
│   │   │   ├── schema.ts             # Drizzle schema
│   │   │   └── client.ts
│   │   ├── license/
│   │   │   ├── verify.ts             # Ed25519 signature check
│   │   │   └── sign.ts               # dev/admin utility
│   │   ├── mcp/
│   │   │   ├── pool.ts               # per-client MCP child process cache
│   │   │   ├── client.ts             # wrapper over @modelcontextprotocol/sdk
│   │   │   ├── permissions.ts        # allow-lists for admin vs client chat
│   │   │   └── types.ts              # Zod schemas for every tool we care about
│   │   ├── qbo/
│   │   │   ├── oauth.ts              # connect / refresh flow
│   │   │   └── tokens.ts             # encrypted token storage per client
│   │   ├── reports/
│   │   │   ├── engine.ts             # template resolver
│   │   │   ├── templates/            # YAML/TS templates (see §11)
│   │   │   └── renderers/{html,pdf,xlsx}.ts
│   │   └── trpc/
│   │       ├── init.ts
│   │       ├── context.ts            # attaches user, org, activeClient
│   │       └── routers/
│   │           ├── org.ts
│   │           ├── clients.ts
│   │           ├── qbo.ts            # every MCP tool, grouped by entity
│   │           ├── reports.ts
│   │           ├── chat.ts           # history + thread CRUD
│   │           └── admin.ts
│   ├── lib/
│   │   ├── env.ts                    # Zod-validated process.env
│   │   ├── branding.ts               # white-label helpers
│   │   ├── feature-flags.ts
│   │   └── zod/                      # shared schemas
│   └── styles/
│       └── globals.css
└── tests/
    ├── unit/
    └── e2e/
```

---

## 6. Multi-Tenancy Model

We model three layers so the same codebase serves "Joe sells to SMBs directly" and "Joe licenses to another bookkeeper who has their own clients."

- **Organization** — the top-level tenant. One per bookkeeping firm (or per direct-buyer SMB). Owns billing, branding, license key, and users.
- **Client** — a QuickBooks company (realm). Many Clients per Organization for a bookkeeping firm; typically one Client per Organization for a direct-buyer SMB. All QBO data the app shows lives under a Client.
- **User** — a BetterAuth account. Joined to an Organization via BetterAuth's organizations plugin, joined to Clients via a separate membership table.

### Drizzle schema (sketch — full version in `src/server/db/schema.ts`)

```ts
// Core — BetterAuth manages users, sessions, accounts, organizations, members.

export const clients = sqliteTable("clients", {
  id: text("id").primaryKey(), // cuid
  orgId: text("org_id").notNull(), // FK → organization.id
  name: text("name").notNull(),
  realmId: text("realm_id").notNull(), // QuickBooks company ID
  environment: text("environment", { enum: ["sandbox", "production"] })
    .notNull()
    .default("sandbox"),
  encryptedRefreshToken: text("refresh_token_enc").notNull(),
  tokenUpdatedAt: integer("token_updated_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const clientMembers = sqliteTable("client_members", {
  id: text("id").primaryKey(),
  clientId: text("client_id").notNull(),
  userId: text("user_id").notNull(),
  role: text("role", {
    enum: ["admin", "bookkeeper", "client_viewer"],
  }).notNull(),
});

export const reportTemplates = sqliteTable("report_templates", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull(),
  slug: text("slug").notNull(), // unique per org
  name: text("name").notNull(),
  kind: text("kind", {
    enum: ["profit_loss", "balance_sheet", "cash_flow", "custom"],
  }).notNull(),
  config: text("config", { mode: "json" }).notNull(), // see §11
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const chatThreads = sqliteTable("chat_threads", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull(),
  clientId: text("client_id"), // null → admin chat
  userId: text("user_id").notNull(),
  title: text("title"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const chatMessages = sqliteTable("chat_messages", {
  id: text("id").primaryKey(),
  threadId: text("thread_id").notNull(),
  role: text("role", { enum: ["user", "assistant", "tool"] }).notNull(),
  content: text("content", { mode: "json" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const licenses = sqliteTable("licenses", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull().unique(),
  keyHash: text("key_hash").notNull(), // sha256 of the signed payload
  plan: text("plan").notNull(), // "mvp", "pro", "enterprise"
  issuedAt: integer("issued_at", { mode: "timestamp" }).notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp" }),
});
```

### Role matrix

| Role                   | Scope                      | Can do                                                 |
| ---------------------- | -------------------------- | ------------------------------------------------------ |
| `org_owner`            | Organization               | Everything, including billing + license + white-label  |
| `admin` / `bookkeeper` | Organization + all Clients | Full MCP tool access across any Client; use Admin Chat |
| `client_viewer`        | Single Client              | Read-only views of their Client; use Client Chat       |

### Tenant routing rule

Every tRPC procedure reads `ctx.org` (from BetterAuth active org) and `ctx.client` (from URL `[clientId]` or header). Middleware rejects if user is not a member of the requested Client. No tool call, report render, or chat invocation runs without this check.

---

## 7. Auth (BetterAuth)

- Install `better-auth` and `better-auth/organization`.
- Drivers: email/password for MVP. Magic link optional if trivial.
- `afterSignUp` hook requires a valid license key (see §13) before creating an Organization.
- Seed script (`scripts/bootstrap-sandbox.ts`) creates Joe's Organization, attaches his Intuit sandbox as a Client, and issues an `org_owner` session so he can log in on first run without clicking through onboarding.

---

## 8. QuickBooks MCP Integration

### Installation

Vendor the Intuit server as a local dependency — do **not** ship our own fork unless we have to:

```bash
# From monorepo root — MCP is packages/quickbooks-online-mcp-server
bun install
bun run build:mcp
```

Add `MCP_QBO_SERVER_PATH` in `apps/console/.env.local` (default in `.env.example`: path to `packages/.../dist/index.js` from the app directory).

### Process model

`src/server/mcp/pool.ts` keeps a `Map<clientId, McpHandle>`. On first tool call for a given Client:

1. Load that Client's refresh token (decrypt).
2. Spawn the MCP server with env:
   - `QUICKBOOKS_CLIENT_ID`, `QUICKBOOKS_CLIENT_SECRET` — from our `.env` (shared OAuth app).
   - `QUICKBOOKS_REFRESH_TOKEN` — from the DB for that Client.
   - `QUICKBOOKS_REALM_ID` — that Client's realmId.
   - `QUICKBOOKS_ENVIRONMENT` — `sandbox` or `production` per Client.
3. Connect via `@modelcontextprotocol/sdk`'s `StdioClientTransport`.
4. `client.listTools()` once, cache the manifest.
5. Keep the child alive for the process lifetime (with idle timeout 10m, auto-respawn on exit).

### Token refresh

The Intuit MCP server handles refresh internally, but we persist updated refresh tokens back to the DB after each spawn by reading whatever token file it writes (or by intercepting via a small wrapper if necessary). This is the only place where token mutation is allowed.

### tRPC surface

`src/server/trpc/routers/qbo.ts` is the canonical mapping from app → MCP. It is organized by entity (one sub-router per entity) and each procedure:

1. Validates input with a Zod schema mirroring the MCP tool's args.
2. Resolves `ctx.client`.
3. Calls `mcp.callTool(toolName, args)` via the pool.
4. Parses the response with Zod and returns typed data to the client.

This gives the UI typed, non-string-keyed access to every tool while keeping the MCP server as the single integration point.

---

## 9. Complete MCP Tool → UI Mapping

Every MCP tool must have a visible home in the UI. The mapping below is exhaustive — Claude Code should not ship the MVP unless every row has a working entry point.

### 9.1 Transactional entities (CRUD + Search on each)

Each of these gets its own left-nav entry under `/clients/[clientId]/<entity>/` with a TanStack-Table list view, a detail drawer, and a TanStack-Form create/edit dialog.

| UI page         | MCP tools covered                                                                                                         |
| --------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Customers       | `create_customer`, `get_customer`, `update_customer`, `delete_customer`, `search_customers`                               |
| Vendors         | `create_vendor`, `get_vendor`, `update_vendor`, `delete_vendor`, `search_vendors`                                         |
| Invoices        | `create_invoice`, `get_invoice`, `update_invoice`, `delete_invoice`, `search_invoices`                                    |
| Payments        | `create_payment`, `get_payment`, `update_payment`, `delete_payment`, `search_payments`                                    |
| Bills           | `create_bill`, `get_bill`, `update_bill`, `delete_bill`, `search_bills`                                                   |
| Bill Payments   | `create_bill_payment`, `get_bill_payment`, `update_bill_payment`, `delete_bill_payment`, `search_bill_payments`           |
| Sales Receipts  | `create_sales_receipt`, `get_sales_receipt`, `update_sales_receipt`, `delete_sales_receipt`, `search_sales_receipts`      |
| Credit Memos    | `create_credit_memo`, `get_credit_memo`, `update_credit_memo`, `delete_credit_memo`, `search_credit_memos`                |
| Refund Receipts | `create_refund_receipt`, `get_refund_receipt`, `update_refund_receipt`, `delete_refund_receipt`, `search_refund_receipts` |
| Deposits        | `create_deposit`, `get_deposit`, `update_deposit`, `delete_deposit`, `search_deposits`                                    |
| Transfers       | `create_transfer`, `get_transfer`, `update_transfer`, `delete_transfer`, `search_transfers`                               |
| Estimates       | `create_estimate`, `get_estimate`, `update_estimate`, `delete_estimate`, `search_estimates`                               |
| Purchase Orders | `create_purchase_order`, `get_purchase_order`, `update_purchase_order`, `delete_purchase_order`, `search_purchase_orders` |
| Vendor Credits  | `create_vendor_credit`, `get_vendor_credit`, `update_vendor_credit`, `delete_vendor_credit`, `search_vendor_credits`      |
| Purchases       | `create_purchase`, `get_purchase`, `update_purchase`, `delete_purchase`, `search_purchases`                               |
| Journal Entries | `create_journal_entry`, `get_journal_entry`, `update_journal_entry`, `delete_journal_entry`, `search_journal_entries`     |
| Time Activities | `create_time_activity`, `get_time_activity`, `update_time_activity`, `delete_time_activity`, `search_time_activities`     |
| Attachables     | `create_attachable`, `get_attachable`, `update_attachable`, `delete_attachable`, `search_attachables`                     |

### 9.2 Chart of Accounts & classification (no delete)

Under `/clients/[clientId]/` as their own pages.

| UI page     | MCP tools covered                                                                |
| ----------- | -------------------------------------------------------------------------------- |
| Accounts    | `create_account`, `get_account`, `update_account`, `search_accounts`             |
| Classes     | `create_class`, `get_class`, `update_class`, `search_classes`                    |
| Departments | `create_department`, `get_department`, `update_department`, `search_departments` |

### 9.3 Settings (under `/clients/[clientId]/settings/`)

| UI page         | MCP tools covered                                                                                |
| --------------- | ------------------------------------------------------------------------------------------------ |
| Terms           | `create_term`, `get_term`, `update_term`, `search_terms`                                         |
| Payment Methods | `create_payment_method`, `get_payment_method`, `update_payment_method`, `search_payment_methods` |
| Tax — Codes     | `get_tax_code`, `search_tax_codes`                                                               |
| Tax — Rates     | `get_tax_rate`, `search_tax_rates`                                                               |
| Tax — Agencies  | `get_tax_agency`, `search_tax_agencies`                                                          |
| Company Info    | `get_company_info`, `update_company_info`                                                        |

### 9.4 Reports (under `/clients/[clientId]/reports/`)

Each report is both (a) a live template you can view, and (b) a downloadable PDF/XLSX. See §11.

| Report                    | MCP tool                      |
| ------------------------- | ----------------------------- |
| Profit & Loss             | `get_profit_and_loss`         |
| Balance Sheet             | `get_balance_sheet`           |
| Cash Flow                 | `get_cash_flow`               |
| Trial Balance             | `get_trial_balance`           |
| General Ledger            | `get_general_ledger`          |
| Customer Sales            | `get_customer_sales`          |
| Aged Receivables          | `get_aged_receivables`        |
| Aged Receivables (Detail) | `get_aged_receivables_detail` |
| Customer Balance          | `get_customer_balance`        |
| Aged Payables             | `get_aged_payables`           |
| Vendor Expenses           | `get_vendor_expenses`         |

### 9.5 Catch-all: "Tool Explorer"

At `/clients/[clientId]/tools` ship a developer-style page that lists **every** MCP tool from `mcp.listTools()` at runtime, auto-generates a form from the tool's JSON schema, and lets the user execute it and see the raw JSON response. This is both insurance (if Intuit adds tools we didn't hard-code) and a useful demo surface.

---

## 10. Dual Chat Interfaces

Both chats use the Vercel AI SDK with Claude Sonnet 4.6 (`claude-sonnet-4-6`) as the default model, streaming, with MCP tools exposed via `experimental_createMCPClient`. They differ in three things: **system prompt**, **tool allow-list**, and **UI placement**.

### 10.1 Admin Chat — `/admin/chat`

- Available to users with `org_owner`, `admin`, or `bookkeeper` role.
- Can switch active Client mid-conversation via a "/client <name>" slash command or a dropdown in the composer.
- Tool allow-list: **all 143 MCP tools** for the currently active Client. Also has virtual tools: `switch_client`, `list_clients`, `compare_across_clients` (fans out a read-only call to every accessible Client).
- System prompt emphasizes: precise numbers, cite the tool that produced each figure, propose but don't auto-execute destructive actions (deletes, updates) — require user confirmation inline.

### 10.2 Client Chat — `/clients/[clientId]/chat`

- Available to any user with membership on that Client, including `client_viewer`.
- Tool allow-list: **read-only by default** — all `get_*`, `search_*`, and all report tools. Write tools are hidden unless the role is `admin`+.
- System prompt is plain-English, friendly, and explicitly avoids accounting jargon unless asked. It can answer "How much revenue did I earn last month?", "Which customers owe me money?", and "Give me a P&L for Q1" by calling the underlying tools and summarizing.
- Long-running reports are rendered as an inline card with a "Download PDF" button that hits the render endpoint.

### 10.3 Shared chat infra

- Threads and messages persisted per §6 schema so users see history across sessions.
- Tool calls render as expandable cards: tool name, pretty-printed args, response summary with a "View raw JSON" toggle.
- Streaming uses AI SDK's `useChat` + `experimental_toolCallStreaming: true`.
- Safety: every tool invocation passes through `src/server/mcp/permissions.ts` which re-checks role + Client membership server-side — the client allow-list is UX, not security.

---

## 11. Report Engine & Templates

Goal: users (and, later, org admins) can author a report template once, then regenerate it any time with live QuickBooks numbers and download it as PDF or XLSX.

### 11.1 Template format

Templates are stored as JSON in `reportTemplates.config`. Shape:

```ts
type ReportTemplate = {
  name: string;                         // "Monthly P&L — Standard"
  kind: "profit_loss" | "balance_sheet" | "cash_flow" | "custom";
  params: {                             // exposed as form controls
    dateRange: "last_month" | "this_quarter" | "ytd" | { from: string; to: string };
    accountingMethod?: "cash" | "accrual";
    summarizeColumnsBy?: "month" | "quarter" | "year";
  };
  sections: ReportSection[];            // headers, KPI tiles, tables, charts, notes
  branding: { logo?: string; primary?: string; footer?: string };
};

type ReportSection =
  | { type: "kpi_grid"; source: "profit_and_loss" | ...; metrics: string[] }
  | { type: "table"; source: "profit_and_loss" | ...; columns: string[] }
  | { type: "chart"; source: ...; chart: "bar" | "line"; series: string[] }
  | { type: "markdown"; content: string }   // supports `{{params.dateRange}}` etc.
```

### 11.2 Seeded templates (ship with MVP)

Each seeded template has a `.tsx` counterpart under `src/server/reports/templates/` for developer ergonomics, and is upserted into `reportTemplates` per-org on bootstrap.

1. **Monthly P&L — Standard** (`profit_loss`)
2. **Quarterly Balance Sheet** (`balance_sheet`)
3. **YTD Cash Flow Statement** (`cash_flow`)
4. **Aged Receivables Summary** (custom — uses aged receivables + customer balance)
5. **Aged Payables Summary** (custom — uses aged payables + vendor expenses)
6. **Monthly Board Packet** (custom — P&L + BS + Cash Flow + commentary section)

### 11.3 Rendering pipeline

```
Template + params  →  ReportEngine.resolve()
                       ├─ calls required MCP tools in parallel
                       ├─ shapes data into the template's sections
                       └─ returns a typed `ResolvedReport`
ResolvedReport     →  HTML renderer (React Server Component)
                   →  PDF renderer (@react-pdf/renderer)
                   →  XLSX renderer (exceljs)
```

HTML view lives at `/clients/[clientId]/reports/[template]`. PDF and XLSX are generated on-demand at the matching `/api/reports/.../pdf` and `.../xlsx` endpoints. No caching in MVP — always live.

### 11.4 Authoring UI (stretch for MVP, otherwise phase 2)

An "Edit Template" screen using TanStack Form to add/remove/reorder sections and edit params. If time is tight, ship the six seeded templates as read-only and punt the editor.

---

## 12. UI/UX Design System

Target aesthetic: Zeni + Custombooks + Linear. Dark by default, light mode supported. Keyboard-driven where it doesn't hurt.

- **Shell:** fixed sidebar (collapsible), sticky topbar with a Client switcher + global command palette (`Cmd+K`).
- **Palette:** neutral grays with one accent (per-org branding color, default `#6366F1`). Success green, warning amber, danger red from Tailwind's tuned palette.
- **Typography:** Inter variable for UI, JetBrains Mono for numbers in tables.
- **Density:** 3 levels — compact, cozy, comfortable — toggle in user preferences. Compact is the default on tables.
- **Data tables:** TanStack Table v8 with column visibility, per-column filters, URL-synced via nuqs, CSV export on any table.
- **Empty states:** every table/chart ships with a hand-written empty state that links to the relevant action (e.g., "No invoices yet. Create one or import from QuickBooks.").
- **Loading:** use skeletons (shadcn) over spinners; stream data with RSC where practical.
- **Command palette:** `Cmd+K` exposes: switch client, go to any section, run any report, start a new chat, run any MCP tool (wraps the Tool Explorer).
- **Accessibility:** shadcn is WAI-ARIA compliant out of the box — don't regress it. All interactive elements keyboard-accessible. Dark-mode contrast validated with `@axe-core/react`.

---

## 13. Licensing & IP Protection

### 13.1 Code

- Private GitHub repo under the **Present Day Inc.** organization.
- `LICENSE` file: a proprietary license with a single-use grant to ZeroCool. Template language:
  > _"This software is the property of Present Day Inc. A license is granted to ZeroCool LLC for internal use only, non-transferable, and does not convey ownership, source code rights, or redistribution rights. All other rights reserved."_
- Engineering contractors sign an IP assignment + NDA before commits.

### 13.2 Runtime license gating

Organizations cannot be created without a valid license key. Claude Code must implement:

- **Key format:** a signed JWT-like payload. Header + claims (`orgName`, `plan`, `issuedAt`, `expiresAt`, `maxClients`) signed with **Ed25519** using Present Day's private key.
- **Verification:** the public key ships in `src/server/license/verify.ts` as a constant. On organization creation, BetterAuth's `afterSignUp` hook runs `verifyLicense(key)`; on failure, it rolls back and returns a friendly error.
- **Key generation:** `scripts/gen-license.ts` signs a payload using `PRESENT_DAY_LICENSE_PRIVATE_KEY` (stored only on Joe's machine and in 1Password). Claude Code should not check the private key into the repo.
- **Enforcement:** `maxClients` is re-checked every time a Client is added to an Organization. Expired licenses flip the app into read-only mode (chat disabled, tool writes disabled) with a banner telling the user to contact Present Day.

### 13.3 White-label

Per-Organization branding fields: `logo`, `productName` (defaults to "Console"), `primaryColor`, `supportEmail`. Surfaced in the sidebar, login page, and every generated PDF/XLSX footer. Lets another bookkeeper rebrand "Console" as their own without a code change.

### 13.4 Anti-forking posture

- No open-source license. Make the default README explicit: "Source-available under license; not open source."
- Any code sharing with Joe or external eyes goes through a deploy, not a repo invite.
- Build artifacts (for production customers) are distributed via container images, not source, once we move past MVP.

---

## 14. Environment & Configuration

`.env.example` ships with:

```
# --- Next.js ---
NEXT_PUBLIC_APP_URL=http://localhost:3000

# --- Auth ---
BETTER_AUTH_SECRET=                # 32 bytes hex
BETTER_AUTH_URL=http://localhost:3000

# --- DB (dev) ---
DATABASE_URL=file:./.data/console.db

# --- Encryption (for stored QBO refresh tokens) ---
TOKEN_ENCRYPTION_KEY=              # 32 bytes hex

# --- Intuit (OAuth app — one app, many realms) ---
QUICKBOOKS_CLIENT_ID=
QUICKBOOKS_CLIENT_SECRET=
QUICKBOOKS_REDIRECT_URI=http://localhost:3000/api/qbo/oauth/callback
QUICKBOOKS_DEFAULT_ENVIRONMENT=sandbox

# --- MCP server (local path to Intuit's repo) ---
MCP_QBO_SERVER_PATH=../../packages/quickbooks-online-mcp-server/dist/index.js

# --- AI ---
ANTHROPIC_API_KEY=

# --- Licensing ---
PRESENT_DAY_LICENSE_PUBLIC_KEY=    # Ed25519 public key (base64)
# PRESENT_DAY_LICENSE_PRIVATE_KEY — not in .env.example; used by gen-license script only
```

`src/lib/env.ts` validates all of the above with Zod and fails fast at boot.

---

## 15. Milestone Roadmap

Claude Code should execute these phases in order. Each phase has a clear exit criterion that Joe can eyeball in five minutes.

### M0 — Repo bootstrap (½ day)

- `create-next-app` with TS, Tailwind v4, App Router.
- Add Biome, shadcn init, bun config, `.env.example`, basic CI (GitHub Actions: typecheck + Biome).
- Exit: `bun dev` renders a shadcn-styled placeholder home page.

### M1 — Auth + multi-tenant shell (1 day)

- BetterAuth with email/password + organizations plugin.
- Drizzle schema for orgs, clients, memberships.
- App shell: sidebar, topbar, Client switcher (hard-coded two stub clients for now), protected `(app)` segment.
- Exit: Joe can sign up with a dev license key, see an org dashboard, switch between two stub clients, and sign out.

### M2 — Intuit Sandbox wiring (1 day)

- Build the QBO OAuth connect flow (`/admin/clients/new` → Intuit → callback → store encrypted refresh token).
- Replace stub clients with a real "Add Client" flow targeting Joe's sandbox.
- Spawn the QBO MCP server child, call `list_tools`, display results at `/admin/tools`.
- Exit: Joe connects his sandbox and sees a live list of 143 tools.

### M3 — Tool-mapped tRPC + list pages (2–3 days)

- Generate tRPC routers per entity (§9.1–9.3) and wire TanStack-Table list pages with server-side search.
- Detail drawers + TanStack-Form create/edit dialogs for all transactional entities.
- Tool Explorer page (§9.5) with auto-generated forms from MCP tool schemas.
- Exit: every MCP tool is reachable from the UI either through an entity page or the Tool Explorer.

### M4 — Reports engine (2 days)

- Report engine (§11) with the six seeded templates.
- HTML, PDF, and XLSX renderers + download buttons.
- Exit: from a Client's Reports page, Joe can view + download any of the six reports populated with live sandbox data.

### M5 — Dual chat (1.5 days)

- AI SDK wiring with MCP tools via `experimental_createMCPClient`.
- Admin Chat with all-tools + `switch_client` virtual tool.
- Client Chat with read-only default tool set.
- Thread persistence + inline tool-call UI + inline report download cards.
- Exit: Joe can demo both chats end-to-end on the sandbox.

### M6 — White-label + license polish (½ day)

- Org branding fields in settings; apply to shell + PDFs.
- License expiry banner + read-only degradation when expired.
- Exit: Joe can change the product name / logo / accent color and the entire app plus generated reports reflect it.

### M7 — Demo pass (½ day)

- Run through Joe's demo script with him.
- Fix any rough edges, record a Loom for stakeholders.
- Exit: recorded demo + a README that lets a fresh machine run it in under 10 minutes.

**Total rough estimate: 8–10 engineering days for one focused builder.**

---

## 16. Deliverables & Exit Criteria for "MVP Done"

- [ ] `bun dev` from a clean clone + `.env.local` brings up the full app.
- [ ] Joe signs up with a license key and reaches the dashboard.
- [ ] Joe connects his Intuit sandbox via real OAuth.
- [ ] Every MCP tool is reachable from the UI (either a dedicated page or the Tool Explorer).
- [ ] Both chats stream, use tools, and persist history.
- [ ] All six seeded reports render with live data and download as both PDF and XLSX.
- [ ] Changing white-label branding updates the shell + generated reports.
- [ ] Expired license flips the app into read-only mode.
- [ ] README + `docs/architecture.md` + `docs/licensing.md` ship in the repo.
- [ ] A 3-minute demo Loom is attached to the PR that closes M7.

---

## 17. Open Questions / Future Work

- **Billing (Stripe)** — out of scope for MVP; add after M7.
- **Audit log** — every tool call should eventually be logged per Org; schema is in the DB, surfacing it is a post-MVP task.
- **Background jobs** — for scheduled reports, import backfills, email digests. Use Inngest or BullMQ later.
- **Production OAuth review** — Intuit production app needs a security review before we leave sandbox; start the paperwork in parallel with M4.
- **Custombooks/Zeni competitive parity** — once MVP lands, do a side-by-side teardown and prioritize feature gaps.
- **Template editor** — §11.4 stretch goal.
- **Hosted offering** — eventually deploy per-org on Fly.io or a single multi-tenant deployment on Vercel + Neon.

---

## 18. Claude Code Handoff Notes

**To Claude Code, reading this for the first time:**

1. Do not deviate from §4 (stack) or §6 (tenancy model) without leaving a short ADR in `docs/adr/` and flagging Joe.
2. Start from M0 and don't skip ahead — each milestone's exit criterion is the gate for the next.
3. Every new tRPC procedure gets a Zod input schema and a Zod output schema. No `z.any()`.
4. Every UI action that writes data (invoice create, customer delete, etc.) surfaces a confirmation step. Chat-initiated writes also require in-thread confirmation.
5. When in doubt about the QuickBooks MCP server's behavior, call the tool against Joe's sandbox and inspect the real response shape rather than inferring from names.
6. Keep PRs scoped to one milestone. Landing M3 in six PRs is fine; landing M0–M4 in one PR is not.
7. Do not commit: `.env.local`, the license private key, any real refresh token, or anything under `.data/`.
8. Ping Joe (on Slack or via a PR comment) at the end of each milestone with a 30-second Loom showing the exit criterion.
9. Use `as const` enum objects instead of TS unions; less string comparison the better

Good luck. Ship it.
