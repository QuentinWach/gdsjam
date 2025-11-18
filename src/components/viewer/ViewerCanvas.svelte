<script lang="ts">
import { onDestroy, onMount } from "svelte";
import { PixiRenderer } from "../../lib/renderer/PixiRenderer";

let canvas: HTMLCanvasElement;
let renderer: PixiRenderer | null = null;

onMount(async () => {
	if (canvas) {
		renderer = new PixiRenderer(canvas);
		await renderer.init(canvas);

		// Render test geometry for prototyping
		renderer.renderTestGeometry(1000); // 1K polygons for initial test
	}
});

onDestroy(() => {
	renderer?.destroy();
});
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

