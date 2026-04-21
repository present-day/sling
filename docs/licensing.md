# Licensing

Runtime enforcement:

1. **Organization bootstrap** (`POST /api/org/bootstrap`) verifies a signed license with `PRESENT_DAY_LICENSE_PUBLIC_KEY` (Ed25519, base64url).
2. **Storage**: SHA-256 hash of the license string is stored in `licenses.key_hash` (not the raw key).
3. **Generation**: use `scripts/gen-keys.ts` for development keys and `scripts/gen-license.ts` with `PRESENT_DAY_LICENSE_PRIVATE_KEY` to mint keys. **Do not commit the private key.**

See `PLAN.md` §13 and `LICENSE` for legal terms.
