// @ts-nocheck — Bun runtime preload; types are provided at execution time.
/**
 * Bun preload that stubs the `server-only` package so node-context scripts
 * (e.g. scripts/smoke-classify.ts) can import server modules. Mirrors what
 * vitest.config.ts already does for the test suite.
 */
import { plugin } from "bun"

plugin({
	name: "stub-server-only",
	setup(build) {
		build.module("server-only", () => ({
			exports: {},
			loader: "object",
		}))
	},
})
