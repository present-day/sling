import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	serverExternalPackages: [
		"better-sqlite3",
		"better-auth",
		"pdfjs-dist",
		"pdf-parse",
	],
};

export default nextConfig;
