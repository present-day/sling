import { redirect } from "next/navigation"
import { cockpitHref, TabScope } from "@/lib/cockpit"

export default async function CockpitIndex({
	params,
}: {
	params: Promise<{ clientId: string }>
}) {
	const { clientId } = await params
	redirect(cockpitHref(clientId, TabScope.sales))
}
