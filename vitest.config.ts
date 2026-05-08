import { resolve } from "node:path"
import { defineConfig } from "vitest/config"

export default defineConfig({
	resolve: {
		alias: {
			"@": resolve(__dirname, "./src"),
			// server-only throws outside Next.js request context.
			// Map it to an empty stub so server-side modules can be imported in tests.
			"server-only": resolve(__dirname, "./src/__mocks__/server-only.ts"),
		},
	},
	test: {
		include: ["src/**/*.test.ts"],
		environment: "node",
	},
})
