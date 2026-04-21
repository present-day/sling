import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import { auth } from "@/server/auth";
import { db } from "@/server/db/client";

export async function createTRPCContext(opts: FetchCreateContextFnOptions) {
	const session = await auth.api.getSession({
		headers: opts.req.headers,
	});
	return {
		db,
		session,
		headers: opts.req.headers,
	};
}

export type TRPCContext = Awaited<ReturnType<typeof createTRPCContext>>;
