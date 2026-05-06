import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import { NuqsAdapter } from "nuqs/adapters/next/app"
import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { TRPCProvider } from "@/trpc/react"
import "./globals.css"

const geistSans = Geist({
	variable: "--font-geist-sans",
	subsets: ["latin"],
})

const geistMono = Geist_Mono({
	variable: "--font-geist-mono",
	subsets: ["latin"],
})

export const metadata: Metadata = {
	title: "Sling",
	description: "AI-native bookkeeping cockpit for QuickBooks",
}

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode
}>) {
	return (
		<html
			lang="en"
			suppressHydrationWarning
			className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
		>
			<body className="min-h-full flex flex-col bg-background text-foreground">
				<ThemeProvider>
					<NuqsAdapter>
						<TooltipProvider>
							<TRPCProvider>{children}</TRPCProvider>
						</TooltipProvider>
					</NuqsAdapter>
					<Toaster />
				</ThemeProvider>
			</body>
		</html>
	)
}
