<script lang="ts">
import { onDestroy, onMount } from "svelte";
import { PixiRenderer } from "../../lib/renderer/PixiRenderer";
// biome-ignore lint/correctness/noUnusedImports: Used in template via $gdsStore
import { gdsStore } from "../../stores/gdsStore";

// Debug mode - set to false to reduce console logs
const DEBUG = false;

let canvas: HTMLCanvasElement;
let renderer: PixiRenderer | null = null;

onMount(async () => {
	if (DEBUG) console.log("[ViewerCanvas] Initializing...");
	if (canvas) {
		renderer = new PixiRenderer();
		await renderer.init(canvas);

		// If there's already a document loaded, render it
		if ($gdsStore.document) {
			renderer.renderGDSDocument($gdsStore.document);
		} else {
			// Otherwise render test geometry for prototyping
			if (DEBUG) console.log("[ViewerCanvas] Rendering test geometry");
			renderer.renderTestGeometry(1000); // 1K polygons for initial test
		}
	}
});

onDestroy(() => {
	if (DEBUG) console.log("[ViewerCanvas] Destroying renderer");
	renderer?.destroy();
});

// Subscribe to GDS store and render when document changes
$: if (renderer?.isReady() && $gdsStore.document) {
	console.log("[ViewerCanvas] Rendering document:", $gdsStore.document.name);
	renderer.renderGDSDocument($gdsStore.document);
}
</script>

<div class="viewer-container">
	<canvas bind:this={canvas} class="viewer-canvas"></canvas>
</div>

<style>
	.viewer-container {
		width: 100%;
		height: 100%;
		position: relative;
		overflow: hidden;
	}

	.viewer-canvas {
		display: block;
		width: 100%;
		height: 100%;
	}
</style>

