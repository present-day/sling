# QuickBooks UI → API map

Entity list routes call `qbo.searchProxy`, which runs Intuit **query language** requests (`select * from …`) via `src/server/qbo/entity-list-search.ts`. Stems and filter fields are defined in `src/lib/entity-search.ts` (`ENTITY_SEARCH`, `ENTITY_QBO_QUERY_ENTITY`, `ENTITY_SEARCH_QUERY_KEY`).

For **Cursor-only** discovery of additional QBO operations while building new endpoints, run the QuickBooks MCP server from a **separate repository** (see root `README.md`) and configure Cursor’s MCP settings locally. The console does not embed or spawn that server.

Historical detail: `PLAN.md` §9 still describes an older MCP-centric mapping; treat it as a product sketch, not the current runtime.
