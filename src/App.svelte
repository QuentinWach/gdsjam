<script lang="ts">
import { onMount } from "svelte";
// biome-ignore lint/correctness/noUnusedImports: Used in Svelte template
import FileUpload from "./components/ui/FileUpload.svelte";
// biome-ignore lint/correctness/noUnusedImports: Used in Svelte template
import ViewerCanvas from "./components/viewer/ViewerCanvas.svelte";
import { DEBUG } from "./lib/config";
import { loadGDSIIFromBuffer } from "./lib/utils/gdsLoader";
import { fetchGDSIIFromURL } from "./lib/utils/urlLoader";
// biome-ignore lint/correctness/noUnusedImports: Used in template via $gdsStore
import { gdsStore } from "./stores/gdsStore";

/**
 * Check for URL parameter and load file from URL if present
 */
onMount(async () => {
	// Parse URL parameters
	const urlParams = new URLSearchParams(window.location.search);
	const fileUrl = urlParams.get("url");

	if (fileUrl) {
		if (DEBUG) {
			console.log("[App] Loading file from URL parameter:", fileUrl);
		}

		try {
			// Fetch the file from URL
			const { arrayBuffer, fileName } = await fetchGDSIIFromURL(fileUrl, (progress, message) => {
				gdsStore.setLoading(true, message, progress);
			});

			// Load the file
			await loadGDSIIFromBuffer(arrayBuffer, fileName);
		} catch (error) {
			console.error("[App] Failed to load file from URL:", error);
			gdsStore.setError(
				`Failed to load file from URL: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}
});
</script>

<main class="app-main">
	<div class="header">
		<div class="title-container">
			<img src="/icon.svg" alt="GDSJam" class="title-icon" />
			<h1 class="title">GDSJam</h1>
		</div>
		<p class="subtitle">Collaborative (not yet) GDSII Viewer</p>
		{#if $gdsStore.fileName}
			<p class="file-name">Loaded: {$gdsStore.fileName}</p>
		{/if}
	</div>

	<div class="viewer-wrapper">
		{#if !$gdsStore.document && !$gdsStore.isLoading}
			<div class="upload-overlay">
				<FileUpload />
			</div>
		{:else if $gdsStore.isLoading || $gdsStore.isRendering}
			<div class="loading-overlay">
				<div class="loading-content">
					<div class="spinner"></div>
					<p class="loading-message">{$gdsStore.loadingMessage}</p>
					<div class="progress-bar">
						<div class="progress-fill" style="width: {$gdsStore.loadingProgress}%"></div>
					</div>
					<p class="progress-text">{Math.round($gdsStore.loadingProgress)}%</p>
				</div>
			</div>
		{/if}

		{#if $gdsStore.document}
			<ViewerCanvas />
		{/if}

		{#if $gdsStore.error}
			<div class="error-overlay">
				<div class="error-content">
					<p class="error-title">Error</p>
					<p class="error-message">{$gdsStore.error}</p>
					<button class="error-button" on:click={() => gdsStore.clearError()}>
						Dismiss
					</button>
				</div>
			</div>
		{/if}
	</div>

	<div class="controls-info">
		<p class="text-sm text-gray-400 keyboard-shortcuts">
			Controls: Mouse wheel to zoom | Middle mouse or Space+Drag to pan | Arrow keys to move | Enter to zoom in | Shift+Enter to zoom out | F to fit view | G to toggle grid | O to toggle fill/outline | P to toggle info panel | L to toggle layer panel | Touch: One finger to pan, two fingers to zoom
		</p>
		<p class="text-sm text-gray-400 footer-note">
			This webapp is client-side only - your GDS file is not uploaded anywhere. Created by <a href="https://outside5sigma.com/" target="_blank" rel="noopener noreferrer" class="creator-link">Wentao</a>.
		</p>
	</div>
</main>

<style>
	.app-main {
		width: 100vw;
		height: 100vh;
		display: flex;
		flex-direction: column;
		background-color: #1a1a1a;
	}

	.header {
		padding: 1rem 1.5rem;
		background-color: #0f0f0f;
		border-bottom: 1px solid #333;
	}

	.title-container {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.title-icon {
		width: 2rem;
		height: 2rem;
	}

	.title {
		margin: 0;
		font-size: 1.5rem;
		font-weight: 600;
		color: #fff;
	}

	.subtitle {
		margin: 0.25rem 0 0 0;
		font-size: 0.875rem;
		color: #888;
	}

	.file-name {
		margin: 0.5rem 0 0 0;
		font-size: 0.875rem;
		color: #4a9eff;
		font-weight: 500;
	}

	.viewer-wrapper {
		flex: 1;
		overflow: hidden;
		position: relative;
	}

	.upload-overlay {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 2rem;
		background-color: #1a1a1a;
	}

	.loading-overlay {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		background-color: rgba(26, 26, 26, 0.95);
		z-index: 100;
	}

	.loading-content {
		text-align: center;
		max-width: 400px;
	}

	.spinner {
		width: 48px;
		height: 48px;
		border: 4px solid #333;
		border-top-color: #4a9eff;
		border-radius: 50%;
		animation: spin 1s linear infinite;
		margin: 0 auto 1rem;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.loading-message {
		margin: 0 0 1rem 0;
		font-size: 1rem;
		color: #ccc;
	}

	.progress-bar {
		width: 100%;
		height: 8px;
		background-color: #333;
		border-radius: 4px;
		overflow: hidden;
		margin-bottom: 0.5rem;
	}

	.progress-fill {
		height: 100%;
		background-color: #4a9eff;
		transition: width 0.1s linear;
	}

	.progress-text {
		margin: 0;
		font-size: 0.875rem;
		color: #888;
	}

	.error-overlay {
		position: absolute;
		top: 1rem;
		right: 1rem;
		z-index: 200;
	}

	.error-content {
		background-color: #3a1a1a;
		border: 1px solid #ff4444;
		border-radius: 8px;
		padding: 1rem 1.5rem;
		max-width: 500px;
		max-height: 80vh;
		overflow-y: auto;
	}

	.error-title {
		margin: 0 0 0.5rem 0;
		font-size: 1rem;
		font-weight: 600;
		color: #ff6666;
	}

	.error-message {
		margin: 0 0 1rem 0;
		font-size: 0.875rem;
		color: #ffaaaa;
		white-space: pre-wrap;
		line-height: 1.5;
	}

	.error-button {
		background-color: #ff4444;
		color: #fff;
		border: none;
		border-radius: 4px;
		padding: 0.5rem 1rem;
		font-size: 0.875rem;
		cursor: pointer;
		transition: background-color 0.2s;
	}

	.error-button:hover {
		background-color: #ff6666;
	}

	.controls-info {
		padding: 0.5rem 1.5rem;
		background-color: #0f0f0f;
		border-top: 1px solid #333;
	}

	.footer-note {
		margin-top: 0.25rem;
	}

	.creator-link {
		color: #4a9eff;
		text-decoration: none;
		transition: color 0.2s;
	}

	.creator-link:hover {
		color: #6bb3ff;
		text-decoration: underline;
	}

	/* Hide keyboard shortcuts on mobile (use FAB instead), but keep footer note */
	@media (max-width: 1023px) {
		.keyboard-shortcuts {
			display: none;
		}
	}
</style>
