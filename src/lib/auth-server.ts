import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/server/auth";

export async function requireSession() {
	const session = await auth.api.getSession({
		headers: await headers(),
	});
	if (!session?.user) {
		redirect("/sign-in");
	}
	return session;
}

export async function requireSessionWithOrg() {
	const session = await requireSession();
	if (!session.session?.activeOrganizationId) {
		redirect("/onboarding");
	}
	return session;
}
