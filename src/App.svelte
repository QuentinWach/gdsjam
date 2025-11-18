<script lang="ts">

</script>

<main class="app-main">
	<div class="header">
		<h1 class="title">GDSJam</h1>
		<p class="subtitle">Collaborative GDSII Viewer - Week 1 Prototype</p>
	</div>

	<div class="viewer-wrapper">
		<ViewerCanvas />
	</div>

	<div class="controls-info">
		<p class="text-sm text-gray-400">
			Controls: Mouse wheel to zoom | Middle mouse or Space+Drag to pan
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

	.viewer-wrapper {
		flex: 1;
		overflow: hidden;
	}

	.controls-info {
		padding: 0.5rem 1.5rem;
		background-color: #0f0f0f;
		border-top: 1px solid #333;
	}
</style>
