"use client"

import { Monitor, Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const order = ["light", "dark", "system"] as const

export function ThemeToggle({ className }: { className?: string }) {
	const { theme, setTheme } = useTheme()
	const [mounted, setMounted] = useState(false)

	useEffect(() => {
		setMounted(true)
	}, [])

	if (!mounted) {
		return (
			<Button
				variant="ghost"
				size="icon-sm"
				aria-label="Toggle theme"
				className={className}
			>
				<Monitor className="opacity-50" />
			</Button>
		)
	}

	const current = (theme ?? "system") as (typeof order)[number]
	const next = order[(order.indexOf(current) + 1) % order.length]
	const Icon = current === "light" ? Sun : current === "dark" ? Moon : Monitor

	return (
		<Button
			variant="ghost"
			size="icon-sm"
			aria-label={`Theme: ${current}. Click for ${next}.`}
			onClick={() => setTheme(next)}
			className={cn(className)}
		>
			<Icon />
		</Button>
	)
}
