import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
	plugins: [svelte()],
	// Use / for custom domain (gdsjam.com)
	base: "/",
	// Monaco Editor worker configuration
	optimizeDeps: {
		include: ["monaco-editor"],
	},
	build: {
		rollupOptions: {
			output: {
				manualChunks: {
					monaco: ["monaco-editor"],
				},
			},
		},
	},
});
