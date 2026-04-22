"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

export default function SignInPage() {
	const router = useRouter();
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [pending, setPending] = useState(false);

	return (
		<div className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-4">
			<div>
				<h1 className="font-heading text-2xl font-semibold">Sign in</h1>
				<p className="text-muted-foreground text-sm">
					ZeroCool Console — bookkeeping cockpit
				</p>
			</div>
			<form
				className="flex flex-col gap-4"
				onSubmit={async (e) => {
					e.preventDefault();
					setPending(true);
					setError(null);
					const res = await authClient.signIn.email({ email, password });
					setPending(false);
					if (res.error) {
						setError(res.error.message ?? "Sign in failed");
						return;
					}
					router.push("/dashboard");
					router.refresh();
				}}
			>
				<div className="space-y-2">
					<Label htmlFor="email">Email</Label>
					<Input
						id="email"
						type="email"
						autoComplete="email"
						value={email}
						onChange={(e) => setEmail(e.target.value)}
						required
					/>
				</div>
				<div className="space-y-2">
					<Label htmlFor="password">Password</Label>
					<Input
						id="password"
						type="password"
						autoComplete="current-password"
						value={password}
						onChange={(e) => setPassword(e.target.value)}
						required
					/>
				</div>
				{error ? <p className="text-destructive text-sm">{error}</p> : null}
				<Button type="submit" disabled={pending}>
					{pending ? "Signing in…" : "Sign in"}
				</Button>
			</form>
			<p className="text-muted-foreground text-sm">
				No account?{" "}
				<Link className="text-primary underline" href="/sign-up">
					Sign up
				</Link>
			</p>
		</div>
	);
}
