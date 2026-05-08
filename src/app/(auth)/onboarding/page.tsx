"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function OnboardingPage() {
	const router = useRouter();
	const [organizationName, setOrganizationName] = useState("");
	const [licenseKey, setLicenseKey] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [pending, setPending] = useState(false);

	return (
		<div className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-4">
			<div>
				<h1 className="font-heading text-2xl font-semibold">
					Activate organization
				</h1>
				<p className="text-muted-foreground text-sm">
					Enter your Present Day license key to create your organization.
				</p>
			</div>
			<form
				className="flex flex-col gap-4"
				onSubmit={async (e) => {
					e.preventDefault();
					setPending(true);
					setError(null);
					const res = await fetch("/api/org/bootstrap", {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ organizationName, licenseKey }),
					});
					const data = (await res.json()) as { error?: string };
					setPending(false);
					if (!res.ok) {
						setError(data.error ?? "Activation failed");
						return;
					}
					router.push("/dashboard");
					router.refresh();
				}}
			>
				<div className="space-y-2">
					<Label htmlFor="org">Organization name</Label>
					<Input
						id="org"
						value={organizationName}
						onChange={(e) => setOrganizationName(e.target.value)}
						required
					/>
				</div>
				<div className="space-y-2">
					<Label htmlFor="license">License key</Label>
					<Input
						id="license"
						value={licenseKey}
						onChange={(e) => setLicenseKey(e.target.value)}
						required
						autoComplete="off"
						spellCheck={false}
						placeholder="eyJ… .eyJ… .<signature>"
					/>
					<p className="text-muted-foreground text-xs">
						Paste the single long line printed by{" "}
						<code className="text-foreground">scripts/gen-license.ts</code> (it
						contains two dots). This is not your{" "}
						<code className="text-foreground">
							PRESENT_DAY_LICENSE_PUBLIC_KEY
						</code>{" "}
						from <code className="text-foreground">.env</code>.
					</p>
				</div>
				{error ? <p className="text-destructive text-sm">{error}</p> : null}
				<Button type="submit" disabled={pending}>
					{pending ? "Activating…" : "Activate"}
				</Button>
			</form>
		</div>
	);
}
