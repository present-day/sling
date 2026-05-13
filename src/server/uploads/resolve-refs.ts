import "server-only"
import type { clients } from "@/server/db/schema"
import { createCustomer } from "@/server/qbo/customer.create"
import type { IntuitClient } from "@/server/qbo/intuit-client"
import { createVendor } from "@/server/qbo/vendor.create"
import type { CommitPayload } from "@/server/uploads/commit"

type ClientRow = typeof clients.$inferSelect

export const RefRole = {
	customer: "CustomerRef",
	vendor: "VendorRef",
} as const
export type RefRole = (typeof RefRole)[keyof typeof RefRole]

export type ResolutionMatch = { id: string; displayName: string }

export type ResolutionPrompt = {
	role: RefRole
	name: string
	matches: ResolutionMatch[]
}

export type ResolutionChoice =
	| { kind: "existing"; value: string }
	| { kind: "create_new"; name: string }

export type ResolutionDecision = {
	role: RefRole
	choice: ResolutionChoice
}

export type ResolveRefsResult =
	| { status: "resolved"; commit: CommitPayload }
	| {
			status: "needs_prompt"
			commit: CommitPayload
			prompts: ResolutionPrompt[]
	  }

const MAX_MATCHES = 5

/**
 * Pre-flight for `uploads.commit`. Walks the top-level QB refs on the draft
 * payload (CustomerRef, VendorRef) and, for any name-only ref, queries the
 * realm for matches.
 *
 * - 1 match → silently patches `value` and returns `resolved`.
 * - 0 or 2+ matches → emits a `ResolutionPrompt` so the wizard can ask the
 *   user. Refs that already carry a `value`, or that aren't present on the
 *   payload, are left alone.
 */
export async function resolveRefs(args: {
	commit: CommitPayload
	intuit: IntuitClient
}): Promise<ResolveRefsResult> {
	const { commit, intuit } = args
	const work = unresolvedRefs(commit)
	if (work.length === 0) {
		return { status: "resolved", commit }
	}

	const prompts: ResolutionPrompt[] = []
	let patched = commit
	for (const item of work) {
		const matches = await queryMatches(intuit, item.role, item.name)
		if (matches.length === 1) {
			patched = patchRefValue(patched, item.role, matches[0]?.id ?? "")
		} else {
			prompts.push({ role: item.role, name: item.name, matches })
		}
	}

	if (prompts.length === 0) {
		return { status: "resolved", commit: patched }
	}
	return { status: "needs_prompt", commit: patched, prompts }
}

/**
 * Apply user-picked (or auto-derived) resolutions to a draft. For
 * `create_new`, posts a stub Customer/Vendor to QBO via the existing
 * `<entity>.create.ts` modules first, then uses the returned id. The result
 * is a draft that can go straight into `commitUpload`.
 */
export async function applyResolutions(args: {
	commit: CommitPayload
	resolutions: ResolutionDecision[]
	client: ClientRow
	intuit: IntuitClient
}): Promise<CommitPayload> {
	const { resolutions, client, intuit } = args
	let patched = args.commit
	for (const r of resolutions) {
		if (r.choice.kind === "existing") {
			patched = patchRefValue(patched, r.role, r.choice.value)
			continue
		}
		const newId = await createStub(client, intuit, r.role, r.choice.name)
		patched = patchRefValue(patched, r.role, newId)
	}
	return patched
}

function unresolvedRefs(commit: CommitPayload): Array<{
	role: RefRole
	name: string
}> {
	const payload = commit.payload as Record<string, unknown>
	const out: Array<{ role: RefRole; name: string }> = []
	const customer = readRef(payload.CustomerRef)
	if (customer && !customer.value && customer.name) {
		out.push({ role: RefRole.customer, name: customer.name })
	}
	const vendor = readRef(payload.VendorRef)
	if (vendor && !vendor.value && vendor.name) {
		out.push({ role: RefRole.vendor, name: vendor.name })
	}
	return out
}

function readRef(
	value: unknown,
): { name?: string; value?: string } | undefined {
	if (value && typeof value === "object") {
		return value as { name?: string; value?: string }
	}
	return undefined
}

async function queryMatches(
	intuit: IntuitClient,
	role: RefRole,
	name: string,
): Promise<ResolutionMatch[]> {
	const entity = role === RefRole.customer ? "Customer" : "Vendor"
	// QBO query language uses single-quoted literals; escape embedded quotes.
	const escaped = name.replace(/'/g, "\\'")
	const query = `SELECT Id, DisplayName FROM ${entity} WHERE DisplayName LIKE '%${escaped}%' MAXRESULTS ${MAX_MATCHES}`
	const res = await intuit.queryEntity<{
		QueryResponse?: {
			Customer?: Array<{ Id: string; DisplayName: string }>
			Vendor?: Array<{ Id: string; DisplayName: string }>
		}
	}>(query)
	const rows =
		(entity === "Customer"
			? res.QueryResponse?.Customer
			: res.QueryResponse?.Vendor) ?? []
	return rows.map((r) => ({ id: r.Id, displayName: r.DisplayName }))
}

async function createStub(
	client: ClientRow,
	intuit: IntuitClient,
	role: RefRole,
	displayName: string,
): Promise<string> {
	if (role === RefRole.customer) {
		const r = await createCustomer(client, { DisplayName: displayName }, intuit)
		return r.id
	}
	const r = await createVendor(client, { DisplayName: displayName }, intuit)
	return r.id
}

function patchRefValue(
	commit: CommitPayload,
	role: RefRole,
	value: string,
): CommitPayload {
	const payload = { ...(commit.payload as Record<string, unknown>) }
	const existing = readRef(payload[role]) ?? {}
	payload[role] = { ...existing, value }
	// Casting at the boundary — the inner Record-shaped patch is opaque to the
	// discriminated-union, but the role keys are constrained by RefRole.
	return { ...commit, payload } as CommitPayload
}
