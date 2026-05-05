<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Coding conventions

`biome.json` is the source of truth. Run `bun biome check --write` before considering a diff final.

- **Formatter / linter:** Biome only. No Prettier, no ESLint.
- **Indentation:** tabs.
- **Semicolons:** none (`javascript.formatter.semicolons: "asNeeded"`).
- **No TypeScript `enum`.** Use `as const` objects with an exported union type derived from the values:
  ```ts
  export const TabScope = {
  	sales: "sales",
  	purchases: "purchases",
  	banking: "banking",
  	books: "books",
  	reports: "reports",
  } as const

  export type TabScope = (typeof TabScope)[keyof typeof TabScope]
  ```
- **String unions:** when values are referenced in more than one place, prefer the `as const` + exported type pattern above over inline `"a" | "b"` unions. Inline unions are fine for one-off props.
