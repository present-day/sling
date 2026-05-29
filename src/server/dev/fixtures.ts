import "server-only"

// Thin re-export so route handlers can pull the fixture builder via the `@/`
// alias instead of climbing out of `src/` with relative paths. The real
// builder lives under `scripts/` because it's also driven by CLI smoke tests.
export { renderSyntheticVendorBill } from "../../../scripts/fixtures/synthetic-pdfs"
