# ZeroCool Console

Source-available bookkeeping cockpit. **Not open source** — see `LICENSE`.

## Prerequisites

- [Bun](https://bun.sh/) and Node.js
- Intuit Developer sandbox app (client ID / secret)
- Anthropic API key (for AI features)

---

## Setup

### 1. Install dependencies

```bash
bun install
```

### 2. Configure environment

Copy `.env.example` to `.env.local` and fill in the values:

```bash
cp .env.example .env.local
```

| Variable | How to get it |
|---|---|
| `BETTER_AUTH_SECRET` | Any 32+ char random string |
| `TOKEN_ENCRYPTION_KEY` | 64 hex chars — `openssl rand -hex 32` |
| `QUICKBOOKS_CLIENT_ID` | Intuit Developer → your app → Keys & credentials |
| `QUICKBOOKS_CLIENT_SECRET` | Same |
| `QUICKBOOKS_REFRESH_TOKEN` | See [QuickBooks OAuth](#quickbooks-oauth) below |
| `QUICKBOOKS_REALM_ID` | Your sandbox company ID (visible in QB URL) |
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com) |
| `PRESENT_DAY_LICENSE_PUBLIC_KEY` | See [License activation](#license-activation) below |

### 3. Build the MCP server

The console spawns `../quickbooks-mcp` as a subprocess. Build it once (and after any changes):

```bash
cd ../quickbooks-mcp && npm install && npm run build && cd ../console
```

### 4. Create the database

```bash
mkdir -p .data
bun run db:migrate
```

### 5. Run the app

```bash
bun dev
```

---

## License activation

Every organization needs a license key to use the app. You sign license keys locally with an Ed25519 keypair — the private key never leaves your machine.

**One-time: generate a keypair**

```bash
bun run scripts/gen-keys.ts
```

Add both printed lines to `.env.local`:

```
PRESENT_DAY_LICENSE_PRIVATE_KEY=<private key>
PRESENT_DAY_LICENSE_PUBLIC_KEY=<public key>
```

> `PRESENT_DAY_LICENSE_PUBLIC_KEY` is the only key the app needs at runtime. The private key is only needed to sign new licenses — never commit it or deploy it.

**Generate a license key for an org**

```bash
bun run scripts/gen-license.ts "Your Org Name"
```

This prints a license key string. After signing up in the app, go to **Activate organization** and paste it in.

---

## QuickBooks OAuth

The console connects to QuickBooks via the sibling `quickbooks-mcp` server. To get a refresh token for local development:

**1. Add `http://localhost:8000/callback` to your Intuit app's redirect URIs**

[developer.intuit.com](https://developer.intuit.com) → your app → Settings → Redirect URIs

**2. Set the redirect URI in `../quickbooks-mcp/.env`**

```
QUICKBOOKS_REDIRECT_URI=http://localhost:8000/callback
```

**3. Run the standalone auth flow**

```bash
cd ../quickbooks-mcp && npm run auth
```

A browser window opens. Log in to your QuickBooks sandbox, authorize the app, and the refresh token is written to `../quickbooks-mcp/.env` automatically.

**4. Copy the values to `console/.env.local`**

```
QUICKBOOKS_REFRESH_TOKEN=<from ../quickbooks-mcp/.env>
QUICKBOOKS_REALM_ID=<your sandbox company ID>
```

---

## Connecting a client

1. Sign up and activate your org (see above)
2. Go to **Clients → Add client** and complete the Intuit OAuth flow
3. The console stores the encrypted refresh token in the local SQLite DB per client

---

## Scripts

| Script | Purpose |
|---|---|
| `bun dev` | Start Next.js dev server (Turbopack) |
| `bun run db:migrate` | Apply Drizzle migrations |
| `bun run db:generate` | Generate a new Drizzle migration |
| `bun run scripts/gen-keys.ts` | Generate Ed25519 keypair for license signing |
| `bun run scripts/gen-license.ts "Org Name"` | Sign a license key for an org |

### Build without real secrets (CI)

```bash
SKIP_ENV_VALIDATION=true bun run build
```

---

## Architecture

See `docs/architecture.md` and `PLAN.md` for the full spec.

The console does not make direct Intuit API calls for QuickBooks data. Instead it spawns `../quickbooks-mcp` as a stdio MCP child process (one per connected client realm) and calls QuickBooks tools through it. The pool lives at `src/server/mcp/pool.ts`. OAuth and encrypted token storage remain in the console (`src/server/qbo/oauth.ts`, Drizzle `clients` table).
