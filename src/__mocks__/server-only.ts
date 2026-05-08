// Vitest mock for the `server-only` package.
// server-only throws at import time in non-Next.js contexts; this empty module
// stands in for it during test runs so server-side modules can be imported freely.
export default {}
