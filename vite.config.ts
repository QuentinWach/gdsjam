import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
	plugins: [svelte()],
	// Use /gdsjam/ for GitHub Pages deployment, / for local dev and other platforms
	base: process.env.VITE_BASE_PATH || "/",
});
