# MCP tool → UI map

The exhaustive mapping lives in `PLAN.md` §9 (every MCP tool has a UI entry point: entity list page, settings page, report, or **Tool Explorer**).

Entity list routes use `search_*` tools via `qbo.searchProxy` in `src/server/trpc/routers/qbo.ts`. Report templates map to `get_*` report tools per §9.4. The **Tool Explorer** (`/clients/[clientId]/tools`) lists all tools returned by `list_tools` at runtime.
