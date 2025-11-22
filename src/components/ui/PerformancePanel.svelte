<script lang="ts">
import { onMount, onDestroy } from "svelte";
import type { PixiRenderer } from "../../lib/renderer/PixiRenderer";

interface Props {
	renderer: PixiRenderer | null;
	visible: boolean;
}

let { renderer, visible }: Props = $props();

let metrics = $state({
	fps: 0,
	visiblePolygons: 0,
	totalPolygons: 0,
	polygonBudget: 0,
	budgetUtilization: 0,
	currentDepth: 0,
	zoomLevel: 1.0,
	zoomThresholdLow: 0.2,
	zoomThresholdHigh: 2.0,
});

// Update metrics periodically (every 500ms) instead of reactively
let updateInterval: number | null = null;

onMount(() => {
	updateInterval = window.setInterval(() => {
		if (renderer && visible) {
			metrics = renderer.getPerformanceMetrics();
		}
	}, 500);
});

onDestroy(() => {
	if (updateInterval !== null) {
		clearInterval(updateInterval);
	}
});

// Format numbers with commas
function formatNumber(num: number): string {
	return num.toLocaleString();
}

// Format percentage
function formatPercent(value: number): string {
	return `${(value * 100).toFixed(1)}%`;
}

// Format zoom level
function formatZoom(zoom: number): string {
	return `${zoom.toFixed(2)}x`;
}
</script>

{#if visible}
	<div class="performance-panel">
		<div class="panel-header">
			<h3>Performance Metrics</h3>
			<span class="hint">Press 'P' to toggle</span>
		</div>

		<div class="metrics-grid">
			<div class="metric">
				<span class="label">FPS:</span>
				<span class="value" class:warning={metrics.fps < 30} class:good={metrics.fps >= 30}>
					{metrics.fps}
				</span>
			</div>

			<div class="metric">
				<span class="label">Visible Polygons:</span>
				<span class="value">{formatNumber(metrics.visiblePolygons)}</span>
			</div>

			<div class="metric">
				<span class="label">Total Polygons:</span>
				<span class="value">{formatNumber(metrics.totalPolygons)}</span>
			</div>

			<div class="metric">
				<span class="label">Polygon Budget:</span>
				<span class="value">{formatNumber(metrics.polygonBudget)}</span>
			</div>

			<div class="metric">
				<span class="label">Budget Usage:</span>
				<span
					class="value"
					class:warning={metrics.budgetUtilization > 0.9}
					class:good={metrics.budgetUtilization < 0.3}
				>
					{formatPercent(metrics.budgetUtilization)}
				</span>
			</div>

			<div class="metric">
				<span class="label">LOD Depth:</span>
				<span class="value">{metrics.currentDepth}</span>
			</div>

			<div class="metric">
				<span class="label">Zoom Level:</span>
				<span class="value">{formatZoom(metrics.zoomLevel)}</span>
			</div>

			<div class="metric">
				<span class="label">Next LOD:</span>
				<span class="value zoom-thresholds">
					{formatZoom(metrics.zoomThresholdLow)} / {formatZoom(metrics.zoomThresholdHigh)}
				</span>
			</div>
		</div>
	</div>
{/if}

<style>
	.performance-panel {
		position: absolute;
		top: 35px;
		right: 10px;
		background: rgba(0, 0, 0, 0.85);
		border: 1px solid #444;
		border-radius: 4px;
		padding: 12px;
		font-family: monospace;
		font-size: 11px;
		color: #fff;
		min-width: 280px;
		z-index: 1000;
		backdrop-filter: blur(4px);
	}

	.panel-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 10px;
		padding-bottom: 8px;
		border-bottom: 1px solid #444;
	}

	h3 {
		margin: 0;
		font-size: 12px;
		font-weight: bold;
		color: #4a9eff;
	}

	.hint {
		font-size: 9px;
		color: #888;
	}

	.metrics-grid {
		display: grid;
		grid-template-columns: 1fr;
		gap: 6px;
	}

	.metric {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.label {
		color: #aaa;
	}

	.value {
		color: #fff;
		font-weight: bold;
	}

	.value.good {
		color: #4ade80;
	}

	.value.warning {
		color: #fbbf24;
	}

	.zoom-thresholds {
		font-size: 10px;
	}
</style>

