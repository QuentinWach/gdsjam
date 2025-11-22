<script lang="ts">
import type { FileStatistics } from "../../types/gds";

interface Props {
	statistics: FileStatistics | null;
	visible: boolean;
}

let { statistics, visible }: Props = $props();

// Format file size
function formatFileSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

// Format time
function formatTime(ms: number): string {
	if (ms < 1000) return `${ms.toFixed(0)} ms`;
	return `${(ms / 1000).toFixed(2)} s`;
}

// Format number with commas
function formatNumber(num: number): string {
	return num.toLocaleString();
}

// Format dimensions
function formatDimension(um: number): string {
	if (um < 1000) return `${um.toFixed(1)} µm`;
	if (um < 1000000) return `${(um / 1000).toFixed(2)} mm`;
	return `${(um / 1000000).toFixed(2)} m`;
}
</script>

{#if visible && statistics}
	<div class="stats-panel">
		<div class="panel-header">
			<h3>File Statistics</h3>
		</div>

		<div class="stats-grid">
			<div class="stat">
				<span class="label">File:</span>
				<span class="value filename" title={statistics.fileName}>{statistics.fileName}</span>
			</div>

			<div class="stat">
				<span class="label">Size:</span>
				<span class="value">{formatFileSize(statistics.fileSizeBytes)}</span>
			</div>

			<div class="stat">
				<span class="label">Parse Time:</span>
				<span class="value">{formatTime(statistics.parseTimeMs)}</span>
			</div>

			<div class="stat">
				<span class="label">Total Cells:</span>
				<span class="value">{formatNumber(statistics.totalCells)}</span>
			</div>

			<div class="stat">
				<span class="label">Top Cells:</span>
				<span class="value">{formatNumber(statistics.topCellCount)}</span>
			</div>

			<div class="stat">
				<span class="label">Total Polygons:</span>
				<span class="value">{formatNumber(statistics.totalPolygons)}</span>
			</div>

			<div class="stat">
				<span class="label">Total Instances:</span>
				<span class="value">{formatNumber(statistics.totalInstances)}</span>
			</div>

			<div class="stat">
				<span class="label">Layers:</span>
				<span class="value">{formatNumber(statistics.layerStats.size)}</span>
			</div>

			<div class="stat">
				<span class="label">Layout Size:</span>
				<span class="value">
					{formatDimension(statistics.layoutWidth)} × {formatDimension(statistics.layoutHeight)}
				</span>
			</div>
		</div>
	</div>
{/if}

<style>
	.stats-panel {
		position: absolute;
		top: 280px;
		right: 10px;
		background: rgba(0, 0, 0, 0.85);
		border: 1px solid #444;
		border-radius: 4px;
		padding: 12px;
		font-family: monospace;
		font-size: 11px;
		color: #fff;
		min-width: 280px;
		max-width: 320px;
		z-index: 1000;
		backdrop-filter: blur(4px);
	}

	.panel-header {
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

	.stats-grid {
		display: grid;
		grid-template-columns: 1fr;
		gap: 6px;
	}

	.stat {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 8px;
	}

	.label {
		color: #aaa;
		white-space: nowrap;
	}

	.value {
		color: #fff;
		font-weight: bold;
		text-align: right;
	}

	.filename {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		max-width: 180px;
	}
</style>

