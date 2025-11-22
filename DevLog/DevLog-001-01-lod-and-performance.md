# DevLog-001-01: LOD and Performance Features Implementation Plan

## Metadata
- **Document Version:** 2.0
- **Created:** 2025-11-22
- **Last Updated:** 2025-11-22
- **Author:** Wentao Jiang
- **Status:** Planning
- **Parent Document:** DevLog-001-mvp-implementation-plan.md
- **Target Completion:** Week 1-2

## Overview

This document details the implementation plan for adaptive Level of Detail (LOD) rendering and performance optimization features. The primary goal is to maintain 60fps rendering performance across diverse GDSII layouts by dynamically adjusting render depth based on visible polygon count, not arbitrary zoom levels.

### Key Updates in v2.0

Based on codebase analysis and user feedback, this version includes significant improvements:

1. **Zoom-Based LOD Triggering**: LOD updates only on significant zoom changes (0.2x or 2.0x), preventing excessive re-renders during smooth zoom animations

2. **Incremental Re-rendering**: Implemented in Week 1 (not Week 2), showing loading indicator and skipping parse step for faster updates

3. **Integrated UI Panels**:
   - Performance Panel positioned below FPS counter (top-right)
   - File Statistics Panel positioned below Performance Panel
   - Both toggle with 'P' key

4. **Layer Visibility Enhancements**:
   - Hidden layers excluded from polygon budget and LOD calculations
   - Sync/desync toggle for collaborative viewing
   - Local-only by default (users have independent layer views)

5. **Improved File Upload**: Clear renderer after successful parse (not before), preserving current view on errors

6. **Testing Deferred**: Focus on implementation first, testing in separate phase

## Design Principles

1. **Performance-Driven**: All LOD decisions based on actual polygon count and FPS, not zoom level
2. **Layout-Agnostic**: Works for any chip size (1mm to 10cm) without calibration
3. **Adaptive**: Automatically adjusts to different regions and polygon densities
4. **Measurable**: Comprehensive metrics for validation and debugging
5. **User-Transparent**: LOD changes should be seamless and imperceptible
6. **Incremental Updates**: Prefer incremental rendering over full re-renders to minimize UI freezing

---

## 1. Adaptive LOD System

### 1.1 Algorithm Overview

**Core Principle**: Adjust render depth to keep visible polygon count within performance budget (100K polygons by default).

**Decision Logic**:
- Visible polygons < 30% of budget → Increase depth (add detail)
- Visible polygons > 90% of budget → Decrease depth (reduce detail)
- Visible polygons 30-90% of budget → Maintain current depth

**Zoom-Based Trigger**:
- LOD updates only trigger on **significant zoom changes** (0.2x or 2x scale change)
- Prevents excessive re-renders during smooth zoom animations
- Example: If current zoom is 1.0x, LOD updates at 0.2x (zoom out) or 2.0x (zoom in)
- After update, new threshold is set relative to new zoom level

**Hysteresis Mechanism**:
- Minimum 1 second between depth changes (prevents thrashing)
- Require sustained threshold violation (not single-frame spike)
- Exponential moving average of visible polygon count
- Zoom threshold prevents single-frame spikes from triggering updates

### 1.2 Implementation Details

**Priority**: P0 (Critical for Week 1 completion)

**Files to Modify**:
- `src/lib/renderer/PixiRenderer.ts` (primary changes)
- `src/lib/config.ts` (add LOD configuration constants)

**New Configuration Constants** (`src/lib/config.ts`):
```typescript
// LOD thresholds (percentage of MAX_POLYGONS_PER_RENDER)
export const LOD_INCREASE_THRESHOLD = 0.3;  // Increase depth if < 30% budget
export const LOD_DECREASE_THRESHOLD = 0.9;  // Decrease depth if > 90% budget

// LOD hysteresis (milliseconds)
export const LOD_CHANGE_COOLDOWN = 1000;  // Min time between depth changes

// LOD zoom thresholds (significant zoom changes only)
export const LOD_ZOOM_OUT_THRESHOLD = 0.2;  // Trigger LOD update at 0.2x zoom (5x zoom out)
export const LOD_ZOOM_IN_THRESHOLD = 2.0;   // Trigger LOD update at 2.0x zoom (2x zoom in)

// LOD depth limits
export const LOD_MIN_DEPTH = 0;
export const LOD_MAX_DEPTH = 10;
```

**New Private Fields** (`PixiRenderer`):
```typescript
private lodMetrics = {
    lastDepthChange: 0,           // Timestamp of last depth change
    depthChangeCount: 0,          // Total number of depth changes
    avgVisiblePolygons: 0,        // Exponential moving average
    lastVisibleCount: 0,          // Last frame's visible count
    lastZoomLevel: 1.0,           // Last zoom level when LOD was updated
    zoomThresholdLow: 0.2,        // Next zoom-out threshold (0.2x of lastZoomLevel)
    zoomThresholdHigh: 2.0,       // Next zoom-in threshold (2.0x of lastZoomLevel)
};
```

**Modified Method** (`performViewportUpdate()`):
```typescript
private performViewportUpdate(): void {
    const viewportBounds = this.getViewportBounds();
    const visibleItems = this.spatialIndex.query(viewportBounds);
    const visibleIds = new Set(visibleItems.map((item) => item.id));

    let visibleCount = 0;
    for (const item of this.allGraphicsItems) {
        const graphics = item.data as Graphics;
        const isInViewport = visibleIds.has(item.id);

        // Get layer visibility (default to true if not set)
        const layerKey = `${item.layer}:${item.datatype}`;
        const isLayerVisible = this.layerVisibility.get(layerKey) ?? true;

        // Combine viewport culling and layer visibility
        const isVisible = isInViewport && isLayerVisible;
        graphics.visible = isVisible;

        if (isVisible) visibleCount++;
    }

    // Update LOD metrics
    this.updateLODMetrics(visibleCount);

    // Check if zoom has changed significantly
    const currentZoom = Math.abs(this.mainContainer.scale.x);
    const zoomChanged = this.hasZoomChangedSignificantly(currentZoom);

    if (zoomChanged) {
        // Check if LOD adjustment needed
        const newDepth = this.calculateOptimalDepth(visibleCount);
        if (this.shouldChangeLOD(visibleCount, newDepth)) {
            console.log(
                `[PixiRenderer] LOD change: depth ${this.currentRenderDepth} → ${newDepth} ` +
                `(visible: ${visibleCount}/${this.maxPolygonsPerRender}, zoom: ${currentZoom.toFixed(2)}x)`
            );
            this.currentRenderDepth = newDepth;
            this.lodMetrics.lastDepthChange = performance.now();
            this.lodMetrics.lastZoomLevel = currentZoom;
            this.lodMetrics.depthChangeCount++;

            // Update zoom thresholds for next trigger
            this.updateZoomThresholds(currentZoom);

            // Trigger incremental re-render
            this.triggerLODRerender();
        }
    }
}
```

**New Methods**:
```typescript
private updateLODMetrics(visibleCount: number): void {
    // Exponential moving average (90% old, 10% new)
    this.lodMetrics.avgVisiblePolygons =
        0.9 * this.lodMetrics.avgVisiblePolygons + 0.1 * visibleCount;
    this.lodMetrics.lastVisibleCount = visibleCount;
}

private hasZoomChangedSignificantly(currentZoom: number): boolean {
    // Check if zoom crossed threshold boundaries
    const lastZoom = this.lodMetrics.lastZoomLevel;

    // Calculate absolute thresholds based on last zoom level
    const zoomOutThreshold = lastZoom * LOD_ZOOM_OUT_THRESHOLD;
    const zoomInThreshold = lastZoom * LOD_ZOOM_IN_THRESHOLD;

    // Trigger if zoomed out significantly (current < threshold)
    if (currentZoom < zoomOutThreshold) {
        return true;
    }

    // Trigger if zoomed in significantly (current > threshold)
    if (currentZoom > zoomInThreshold) {
        return true;
    }

    return false;
}

private updateZoomThresholds(currentZoom: number): void {
    // Set new thresholds relative to current zoom
    this.lodMetrics.zoomThresholdLow = currentZoom * LOD_ZOOM_OUT_THRESHOLD;
    this.lodMetrics.zoomThresholdHigh = currentZoom * LOD_ZOOM_IN_THRESHOLD;
}

private calculateOptimalDepth(visibleCount: number): number {
    const utilization = visibleCount / this.maxPolygonsPerRender;
    let newDepth = this.currentRenderDepth;

    if (utilization < LOD_INCREASE_THRESHOLD) {
        newDepth = Math.min(LOD_MAX_DEPTH, this.currentRenderDepth + 1);
    } else if (utilization > LOD_DECREASE_THRESHOLD) {
        newDepth = Math.max(LOD_MIN_DEPTH, this.currentRenderDepth - 1);
    }

    return newDepth;
}

private shouldChangeLOD(visibleCount: number, newDepth: number): boolean {
    // No change needed
    if (newDepth === this.currentRenderDepth) {
        return false;
    }

    // Check cooldown period
    const now = performance.now();
    const timeSinceLastChange = now - this.lodMetrics.lastDepthChange;
    if (timeSinceLastChange < LOD_CHANGE_COOLDOWN) {
        return false;
    }

    return true;
}

private async triggerLODRerender(): Promise<void> {
    // Incremental re-render: Only render instances at new depth
    console.log('[PixiRenderer] LOD re-render triggered (incremental)');

    if (!this.currentDocument) return;

    // Show loading indicator
    this.gdsStore?.setRendering(true, 'Adjusting level of detail...');

    // Clear only instance-related graphics (keep depth=0 polygons)
    this.clearInstanceGraphics();

    // Re-render with new depth
    await this.renderGDSDocument(this.currentDocument, this.lastProgressCallback);

    // Update viewport culling immediately (don't wait for debounce)
    this.performViewportUpdate();

    this.gdsStore?.setRendering(false);
}

private clearInstanceGraphics(): void {
    // Remove graphics from instances (depth > 0)
    // Keep graphics from top-level cells (depth = 0)
    // This is a simplified approach - full implementation would track depth per item

    // For MVP: Clear all and re-render (simpler, still faster than full parse+render)
    for (const item of this.allGraphicsItems) {
        const graphics = item.data as Graphics;
        graphics.destroy();
    }
    this.allGraphicsItems = [];
    this.spatialIndex.clear();
    this.mainContainer.removeChildren();
}
```

**Dependencies**:
- Existing viewport culling infrastructure (`performViewportUpdate()`)
- Existing render pipeline (`renderGDSDocument()`, `renderCellGeometry()`)
- Spatial index for visible polygon queries
- Layer visibility map for filtering hidden layers

**Key Implementation Notes**:
1. **Zoom Threshold Logic**: LOD only updates when zoom changes by 5x (out) or 2x (in)
   - Prevents excessive re-renders during smooth zoom animations
   - Example: At 1.0x zoom, next update at 0.2x or 2.0x
   - After update at 2.0x, next update at 0.4x or 4.0x

2. **Incremental Re-render**: Only clears and re-renders geometry, not full parse
   - Parsing is skipped (document already in memory)
   - Significantly faster than full reload (seconds vs. minutes for large files)
   - Shows loading indicator during re-render

3. **Layer Visibility Integration**: Hidden layers excluded from visible polygon count
   - Allows more detail in visible layers when some layers are hidden
   - Improves performance when user hides dense layers

**Estimated Complexity**: Medium (3-4 hours)

---

## 2. Performance Metrics Display

### 2.1 Overview

Real-time performance metrics panel to monitor rendering performance and debug LOD behavior. Panel is positioned **below the FPS counter** in the top-right corner and can be **toggled with the 'P' key**.

**Priority**: P0 (Critical for Week 1 validation and debugging)

### 2.2 Metrics to Display

1. **FPS** (already implemented, top-right corner at ~10px from top)
2. **Visible Polygons**: `{visibleCount} / {totalRendered}` (excludes hidden layers)
3. **Render Depth**: `Depth: {currentRenderDepth} / {maxDepth}`
4. **Zoom Level**: `Zoom: {scale.toFixed(2)}x` (with next LOD thresholds)
5. **Viewport Bounds**: `Viewport: ({minX}, {minY}) to ({maxX}, {maxY}) µm`
6. **Memory Usage**: `Memory: {usedMB} MB` (if `performance.memory` available)
7. **LOD Status**: `Next LOD: {zoomThresholdLow.toFixed(2)}x / {zoomThresholdHigh.toFixed(2)}x`

### 2.3 Implementation Details

**Files to Create**:
- `src/components/ui/PerformancePanel.svelte` (new component)

**Files to Modify**:
- `src/lib/renderer/PixiRenderer.ts` (expose metrics via getter)
- `src/components/viewer/ViewerCanvas.svelte` (add PerformancePanel and keyboard handler)

**New Component** (`src/components/ui/PerformancePanel.svelte`):
```svelte
<script lang="ts">
interface PerformanceMetrics {
    fps: number;
    visiblePolygons: number;
    totalPolygons: number;
    renderDepth: number;
    maxDepth: number;
    viewport: {
        minX: number;
        minY: number;
        maxX: number;
        maxY: number;
    };
    zoom: number;
    zoomThresholdLow: number;
    zoomThresholdHigh: number;
    memoryMB?: number;
}

export let metrics: PerformanceMetrics;
export let visible: boolean = true;

function formatNumber(n: number): string {
    if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
    if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
    return n.toString();
}

function formatCoord(n: number): string {
    if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1)}mm`;
    return `${n.toFixed(1)}µm`;
}
</script>

{#if visible}
<div class="performance-panel">
    <div class="panel-header">
        <span class="title">Performance</span>
        <span class="hint">(Press P to toggle)</span>
    </div>

    <div class="metric">
        <span class="label">FPS:</span>
        <span class="value" class:warning={metrics.fps < 30} class:error={metrics.fps < 15}>
            {metrics.fps}
        </span>
    </div>
    <div class="metric">
        <span class="label">Polygons:</span>
        <span class="value">
            {formatNumber(metrics.visiblePolygons)} / {formatNumber(metrics.totalPolygons)}
        </span>
    </div>
    <div class="metric">
        <span class="label">Depth:</span>
        <span class="value">{metrics.renderDepth} / {metrics.maxDepth}</span>
    </div>
    <div class="metric">
        <span class="label">Zoom:</span>
        <span class="value">{metrics.zoom.toFixed(2)}x</span>
    </div>
    <div class="metric">
        <span class="label">Next LOD:</span>
        <span class="value small">
            {metrics.zoomThresholdLow.toFixed(2)}x / {metrics.zoomThresholdHigh.toFixed(2)}x
        </span>
    </div>
    <div class="metric">
        <span class="label">Viewport:</span>
        <span class="value small">
            ({formatCoord(metrics.viewport.minX)}, {formatCoord(metrics.viewport.minY)}) to
            ({formatCoord(metrics.viewport.maxX)}, {formatCoord(metrics.viewport.maxY)})
        </span>
    </div>
    {#if metrics.memoryMB !== undefined}
    <div class="metric">
        <span class="label">Memory:</span>
        <span class="value">{metrics.memoryMB.toFixed(0)} MB</span>
    </div>
    {/if}
</div>
{/if}

<style>
.performance-panel {
    position: fixed;
    top: 35px;  /* Below FPS counter */
    right: 10px;
    background: rgba(0, 0, 0, 0.85);
    color: #ccc;
    padding: 10px 12px;
    border-radius: 4px;
    font-family: monospace;
    font-size: 11px;
    line-height: 1.6;
    pointer-events: none;
    z-index: 1000;
    border: 1px solid rgba(255, 255, 255, 0.1);
}

.panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 6px;
    padding-bottom: 4px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.2);
}

.title {
    color: #fff;
    font-weight: bold;
    font-size: 12px;
}

.hint {
    color: #666;
    font-size: 9px;
}

.metric {
    display: flex;
    gap: 8px;
}

.label {
    color: #888;
    min-width: 70px;
}

.value {
    color: #0f0;
}

.value.warning {
    color: #ff0;
}

.value.error {
    color: #f00;
}

.value.small {
    font-size: 10px;
}
</style>
```

**Modified Method** (`PixiRenderer.ts`):
```typescript
public getPerformanceMetrics(): PerformanceMetrics {
    const viewportBounds = this.getViewportBounds();
    const visibleItems = this.spatialIndex.query(viewportBounds);

    // Count only visible polygons (excluding hidden layers)
    let visibleCount = 0;
    for (const item of visibleItems) {
        const layerKey = `${item.layer}:${item.datatype}`;
        const isLayerVisible = this.layerVisibility.get(layerKey) ?? true;
        if (isLayerVisible) {
            visibleCount++;
        }
    }

    return {
        fps: this.getCurrentFPS(),
        visiblePolygons: visibleCount,
        totalPolygons: this.allGraphicsItems.length,
        renderDepth: this.currentRenderDepth,
        maxDepth: LOD_MAX_DEPTH,
        viewport: viewportBounds,
        zoom: Math.abs(this.mainContainer.scale.x),
        zoomThresholdLow: this.lodMetrics.zoomThresholdLow,
        zoomThresholdHigh: this.lodMetrics.zoomThresholdHigh,
        memoryMB: (performance as any).memory?.usedJSHeapSize / 1024 / 1024,
    };
}

private getCurrentFPS(): number {
    // Calculate FPS from frame timing
    const now = performance.now();
    const delta = now - this.lastFrameTime;
    this.lastFrameTime = now;
    return delta > 0 ? Math.round(1000 / delta) : 0;
}
```

**Integration** (`src/components/viewer/ViewerCanvas.svelte`):
```svelte
<script lang="ts">
import PerformancePanel from '../ui/PerformancePanel.svelte';
import { onMount } from 'svelte';

let performanceMetrics = $state({
    fps: 0,
    visiblePolygons: 0,
    totalPolygons: 0,
    renderDepth: 0,
    maxDepth: 10,
    viewport: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
    zoom: 1.0,
    zoomThresholdLow: 0.2,
    zoomThresholdHigh: 2.0,
});
let showPerformancePanel = $state(false);  // Hidden by default

// Keyboard handler for 'P' key
function handleKeyPress(e: KeyboardEvent) {
    if (e.key === 'p' || e.key === 'P') {
        showPerformancePanel = !showPerformancePanel;
        console.log(`[ViewerCanvas] Performance panel ${showPerformancePanel ? 'shown' : 'hidden'}`);
    }
}

onMount(() => {
    // Add keyboard listener
    window.addEventListener('keydown', handleKeyPress);

    // Update metrics every 500ms
    const metricsInterval = setInterval(() => {
        if (renderer) {
            performanceMetrics = renderer.getPerformanceMetrics();
        }
    }, 500);

    return () => {
        window.removeEventListener('keydown', handleKeyPress);
        clearInterval(metricsInterval);
    };
});
</script>

<PerformancePanel metrics={performanceMetrics} visible={showPerformancePanel} />
```

**Key Features**:
1. **Toggle with 'P' key**: Hidden by default, press 'P' to show/hide
2. **Positioned below FPS counter**: At `top: 35px` to avoid overlap
3. **Real-time updates**: Metrics refresh every 500ms
4. **Layer-aware polygon count**: Excludes hidden layers from visible count
5. **LOD threshold display**: Shows next zoom levels that will trigger LOD update

**Estimated Complexity**: Low (1-2 hours)

---

## 3. File Statistics Panel

### 3.1 Overview

Display comprehensive statistics about the loaded GDSII file. This panel is **integrated below the Performance Panel** in the top-right corner and shares the same 'P' key toggle.

**Priority**: P1 (Important for debugging and validation)

### 3.2 Statistics to Display

1. **File Info**:
   - File name
   - File size (MB/GB)
   - Parse time (seconds)

2. **Document Structure**:
   - Total cells
   - Top-level cells (count and names)
   - Total polygons across all cells
   - Total instances

3. **Layers**:
   - Number of unique layers
   - Layer list with polygon counts (scrollable)

4. **Bounding Box**:
   - Layout dimensions (width × height in mm)
   - Coordinate range

### 3.3 Implementation Details

**Priority**: P1

**Files to Create**:
- `src/components/ui/FileStatsPanel.svelte` (new component, integrated with PerformancePanel)

**Files to Modify**:
- `src/types/gds.ts` (add FileStatistics interface)
- `src/lib/gds/GDSParser.ts` (collect statistics during parsing)
- `src/stores/gdsStore.ts` (store statistics)
- `src/components/viewer/ViewerCanvas.svelte` (add FileStatsPanel below PerformancePanel)

**New Interface** (`src/types/gds.ts`):
```typescript
export interface FileStatistics {
    fileName: string;
    fileSizeBytes: number;
    parseTimeMs: number;
    totalCells: number;
    topCellCount: number;
    topCellNames: string[];
    totalPolygons: number;
    totalInstances: number;
    layerStats: Map<string, {
        layer: number;
        datatype: number;
        polygonCount: number;
    }>;
    boundingBox: BoundingBox;
    layoutWidth: number;   // in micrometers
    layoutHeight: number;  // in micrometers
}
```

**Modified Parser** (`GDSParser.ts`):
```typescript
export async function parseGDSII(
    buffer: ArrayBuffer,
    fileName: string,
    onProgress?: (progress: number, message: string) => void
): Promise<{ document: GDSDocument; statistics: FileStatistics }> {
    const startTime = performance.now();

    // ... existing parsing code ...

    // Collect statistics during parsing (no extra pass needed)
    const statistics = collectStatistics(document, fileName, buffer.byteLength, performance.now() - startTime);

    return { document, statistics };
}

function collectStatistics(
    doc: GDSDocument,
    fileName: string,
    fileSizeBytes: number,
    parseTimeMs: number
): FileStatistics {
    let totalPolygons = 0;
    let totalInstances = 0;
    const layerStats = new Map<string, { layer: number; datatype: number; polygonCount: number }>();

    for (const cell of doc.cells.values()) {
        totalPolygons += cell.polygons.length;
        totalInstances += cell.instances.length;

        for (const polygon of cell.polygons) {
            const key = `${polygon.layer}:${polygon.datatype}`;
            const existing = layerStats.get(key) || { layer: polygon.layer, datatype: polygon.datatype, polygonCount: 0 };
            existing.polygonCount++;
            layerStats.set(key, existing);
        }
    }

    return {
        fileName,
        fileSizeBytes,
        parseTimeMs,
        totalCells: doc.cells.size,
        topCellCount: doc.topCells.length,
        topCellNames: doc.topCells,
        totalPolygons,
        totalInstances,
        layerStats,
        boundingBox: doc.boundingBox,
        layoutWidth: doc.boundingBox.maxX - doc.boundingBox.minX,
        layoutHeight: doc.boundingBox.maxY - doc.boundingBox.minY,
    };
}
```

**New Component** (`src/components/ui/FileStatsPanel.svelte`):
```svelte
<script lang="ts">
import type { FileStatistics } from '../../types/gds';

export let statistics: FileStatistics | null;
export let visible: boolean = true;

function formatBytes(bytes: number): string {
    if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(2)} GB`;
    if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
    if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(1)} KB`;
    return `${bytes} B`;
}

function formatDimension(micrometers: number): string {
    if (micrometers >= 1000) return `${(micrometers / 1000).toFixed(2)} mm`;
    return `${micrometers.toFixed(1)} µm`;
}
</script>

{#if visible && statistics}
<div class="stats-panel">
    <h3>File Statistics</h3>

    <section>
        <h4>File Info</h4>
        <div class="stat-row">
            <span class="label">Name:</span>
            <span class="value">{statistics.fileName}</span>
        </div>
        <div class="stat-row">
            <span class="label">Size:</span>
            <span class="value">{formatBytes(statistics.fileSizeBytes)}</span>
        </div>
        <div class="stat-row">
            <span class="label">Parse Time:</span>
            <span class="value">{(statistics.parseTimeMs / 1000).toFixed(2)}s</span>
        </div>
    </section>

    <section>
        <h4>Structure</h4>
        <div class="stat-row">
            <span class="label">Total Cells:</span>
            <span class="value">{statistics.totalCells}</span>
        </div>
        <div class="stat-row">
            <span class="label">Top Cells:</span>
            <span class="value">{statistics.topCellCount}</span>
        </div>
        <div class="stat-row">
            <span class="label">Total Polygons:</span>
            <span class="value">{statistics.totalPolygons.toLocaleString()}</span>
        </div>
        <div class="stat-row">
            <span class="label">Total Instances:</span>
            <span class="value">{statistics.totalInstances.toLocaleString()}</span>
        </div>
    </section>

    <section>
        <h4>Layout Dimensions</h4>
        <div class="stat-row">
            <span class="label">Width:</span>
            <span class="value">{formatDimension(statistics.layoutWidth)}</span>
        </div>
        <div class="stat-row">
            <span class="label">Height:</span>
            <span class="value">{formatDimension(statistics.layoutHeight)}</span>
        </div>
    </section>

    <section>
        <h4>Layers ({statistics.layerStats.size})</h4>
        <div class="layer-list">
            {#each Array.from(statistics.layerStats.values()).sort((a, b) => a.layer - b.layer) as layerStat}
            <div class="layer-row">
                <span class="layer-id">{layerStat.layer}:{layerStat.datatype}</span>
                <span class="layer-count">{layerStat.polygonCount.toLocaleString()}</span>
            </div>
            {/each}
        </div>
    </section>
</div>
{/if}

<style>
.stats-panel {
    position: fixed;
    top: 280px;  /* Below PerformancePanel (35px + ~245px height) */
    right: 10px;
    width: 280px;
    max-height: calc(100vh - 300px);
    overflow-y: auto;
    background: rgba(0, 0, 0, 0.85);
    color: #ccc;
    padding: 10px 12px;
    border-radius: 4px;
    font-family: monospace;
    font-size: 11px;
    z-index: 1000;
    border: 1px solid rgba(255, 255, 255, 0.1);
}

h3 {
    margin: 0 0 12px 0;
    font-size: 14px;
    color: #fff;
    border-bottom: 1px solid #444;
    padding-bottom: 4px;
}

h4 {
    margin: 8px 0 4px 0;
    font-size: 11px;
    color: #888;
    text-transform: uppercase;
}

section {
    margin-bottom: 12px;
}

.stat-row {
    display: flex;
    justify-content: space-between;
    margin: 2px 0;
}

.label {
    color: #888;
}

.value {
    color: #0f0;
}

.layer-list {
    max-height: 200px;
    overflow-y: auto;
}

.layer-row {
    display: flex;
    justify-content: space-between;
    padding: 2px 4px;
    margin: 1px 0;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 2px;
}

.layer-id {
    color: #aaa;
}

.layer-count {
    color: #0f0;
}
</style>
```

**Integration Notes**:
1. **Shared Toggle**: Uses same 'P' key as PerformancePanel
2. **Positioned Below**: Starts at `top: 280px` to avoid overlap
3. **Scrollable Layers**: Layer list scrolls independently if many layers
4. **Statistics Collection**: Done during parsing (no extra pass)
5. **Stored in gdsStore**: Available to all components

**Estimated Complexity**: Low-Medium (2 hours)

---

## 4. File Upload Improvements

### 4.1 Overview

Enhance file upload UX with explicit upload button and better state management. **Clear renderer AFTER successful parsing** to avoid losing current view on parse errors.

**Priority**: P2 (Nice to have for Week 1)

### 4.2 Features

1. **Upload Button**: Explicit button in addition to drag-and-drop
2. **Clear After Parse**: Clear renderer only after successful parse (not before)
3. **Upload Progress**: Visual feedback during file read and parse
4. **Error Recovery**: Better error handling with current view preserved on failure

### 4.3 Implementation Details

**Files to Modify**:
- `src/components/ui/FileUpload.svelte` (add upload button)
- `src/lib/renderer/PixiRenderer.ts` (add clear() method)
- `src/stores/gdsStore.ts` (add reset() method)

**Modified Component** (`FileUpload.svelte`):
```svelte
<script lang="ts">
// ... existing code ...

function handleUploadClick() {
    fileInputElement.click();
}

async function handleFile(file: File) {
    try {
        // Parse file first
        const buffer = await file.arrayBuffer();
        const { document, statistics } = await parseGDSII(
            buffer,
            file.name,
            (progress, message) => {
                gdsStore.setLoading(true, message, progress);
            }
        );

        // Only clear after successful parse
        if (renderer) {
            renderer.clear();
        }
        gdsStore.reset();

        // Set new document and statistics
        gdsStore.setDocument(document, file.name, statistics);

        // Render
        await renderer.renderGDSDocument(document, (progress, message) => {
            gdsStore.setRendering(true, message, progress);
        });

        gdsStore.setLoading(false);
        gdsStore.setRendering(false);

    } catch (error) {
        console.error('[FileUpload] Error loading file:', error);
        gdsStore.setError(error.message);
        // Current view is preserved on error
    }
}
</script>

<div class="upload-container">
    <!-- Existing drag-and-drop zone -->
    <div class="drop-zone" class:dragging={isDragging} ...>
        <!-- ... existing content ... -->
    </div>

    <!-- New upload button -->
    <button class="upload-button" onclick={handleUploadClick}>
        Choose GDSII File
    </button>

    <input
        type="file"
        accept=".gds,.gdsii"
        bind:this={fileInputElement}
        onchange={handleFileInput}
        style="display: none;"
    />
</div>

<style>
.upload-button {
    margin-top: 12px;
    padding: 10px 20px;
    background: #333;
    color: #fff;
    border: 1px solid #555;
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
}

.upload-button:hover {
    background: #444;
    border-color: #666;
}
</style>
```

**New Method** (`PixiRenderer.ts`):
```typescript
public clear(): void {
    // Clear all graphics
    for (const item of this.allGraphicsItems) {
        const graphics = item.data as Graphics;
        graphics.destroy();
    }
    this.allGraphicsItems = [];

    // Clear spatial index
    this.spatialIndex.clear();

    // Clear containers
    this.mainContainer.removeChildren();
    this.gridContainer.removeChildren();

    // Reset state
    this.currentRenderDepth = 0;
    this.lodMetrics = {
        lastDepthChange: 0,
        depthChangeCount: 0,
        avgVisiblePolygons: 0,
        lastVisibleCount: 0,
    };

    console.log('[PixiRenderer] Renderer cleared');
}
```

**New Method** (`gdsStore.ts`):
```typescript
function reset() {
    state.document = null;
    state.fileName = null;
    state.isLoading = false;
    state.loadingMessage = '';
    state.loadingProgress = 0;
    state.error = null;
    state.statistics = null;
}
```

**Key Changes**:
1. **Parse First**: Parse file before clearing renderer
2. **Clear on Success**: Only clear if parse succeeds
3. **Preserve on Error**: Current view remains if new file fails to parse
4. **Better UX**: User doesn't lose work if they accidentally select wrong file

**Estimated Complexity**: Low (1 hour)

---

## 5. Layer Visibility Control Panel

### 5.1 Overview

Interactive panel to toggle layer visibility for selective rendering. **Includes option to sync/desync layer visibility across users** for collaborative viewing.

**Priority**: P2 (Defer to Week 2 if time constrained)

### 5.2 Features

1. **Layer List**: All layers with checkboxes
2. **Color Indicators**: Visual layer color swatches
3. **Bulk Operations**: "Show All" / "Hide All" buttons
4. **Polygon Count**: Show polygon count per layer
5. **Persistent State**: Maintain visibility during pan/zoom
6. **Sync Toggle**: User can choose to sync or desync layer visibility with other users
7. **Exclude from Budget**: Hidden layers excluded from polygon budget and LOD calculations

### 5.3 Implementation Details

**Files to Create**:
- `src/components/ui/LayerPanel.svelte` (new component)
- `src/stores/layerStore.ts` (layer visibility state)

**Files to Modify**:
- `src/lib/renderer/PixiRenderer.ts` (filter by layer visibility)
- `src/types/gds.ts` (already has Layer interface)

**New Store** (`src/stores/layerStore.ts`):
```typescript
import { writable } from 'svelte/store';

interface LayerVisibility {
    [key: string]: boolean; // key: "layer:datatype"
}

interface LayerStoreState {
    visibility: LayerVisibility;
    syncEnabled: boolean;  // Whether to sync with other users
}

function createLayerStore() {
    const { subscribe, set, update } = writable<LayerStoreState>({
        visibility: {},
        syncEnabled: false,  // Default: local only
    });

    return {
        subscribe,
        setLayers: (layers: Map<string, Layer>) => {
            update(state => {
                const visibility: LayerVisibility = {};
                for (const [key, layer] of layers) {
                    visibility[key] = layer.visible;
                }
                return { ...state, visibility };
            });
        },
        toggleLayer: (key: string) => {
            update(state => ({
                ...state,
                visibility: {
                    ...state.visibility,
                    [key]: !state.visibility[key]
                }
            }));
        },
        showAll: () => {
            update(state => {
                const newVisibility = { ...state.visibility };
                for (const key in newVisibility) {
                    newVisibility[key] = true;
                }
                return { ...state, visibility: newVisibility };
            });
        },
        hideAll: () => {
            update(state => {
                const newVisibility = { ...state.visibility };
                for (const key in newVisibility) {
                    newVisibility[key] = false;
                }
                return { ...state, visibility: newVisibility };
            });
        },
        toggleSync: () => {
            update(state => ({
                ...state,
                syncEnabled: !state.syncEnabled
            }));
        },
        setSyncEnabled: (enabled: boolean) => {
            update(state => ({
                ...state,
                syncEnabled: enabled
            }));
        },
    };
}

export const layerStore = createLayerStore();
```

**New Component** (`src/components/ui/LayerPanel.svelte`):
```svelte
<script lang="ts">
import { layerStore } from '../../stores/layerStore';
import type { FileStatistics } from '../../types/gds';

export let statistics: FileStatistics | null;
export let visible: boolean = true;

let storeState = $derived($layerStore);
let layerVisibility = $derived(storeState.visibility);
let syncEnabled = $derived(storeState.syncEnabled);

function toggleLayer(key: string) {
    layerStore.toggleLayer(key);
    onLayerVisibilityChange();
}

function onLayerVisibilityChange() {
    // Notify renderer to update visibility
    window.dispatchEvent(new CustomEvent('layer-visibility-changed', {
        detail: { visibility: layerVisibility, syncEnabled }
    }));

    // If sync enabled, broadcast to Y.js (Week 2 - collaboration)
    if (syncEnabled) {
        // TODO: Sync with Y.js shared state
    }
}

function toggleSyncMode() {
    layerStore.toggleSync();
    console.log(`[LayerPanel] Layer sync ${!syncEnabled ? 'enabled' : 'disabled'}`);
}
</script>

{#if visible && statistics}
<div class="layer-panel">
    <div class="panel-header">
        <h3>Layers ({statistics.layerStats.size})</h3>

        <div class="sync-toggle">
            <label>
                <input
                    type="checkbox"
                    checked={syncEnabled}
                    onchange={toggleSyncMode}
                />
                <span class="sync-label">Sync with others</span>
            </label>
        </div>

        <div class="bulk-actions">
            <button onclick={() => { layerStore.showAll(); onLayerVisibilityChange(); }}>
                Show All
            </button>
            <button onclick={() => { layerStore.hideAll(); onLayerVisibilityChange(); }}>
                Hide All
            </button>
        </div>
    </div>

    <div class="layer-list">
        {#each Array.from(statistics.layerStats.entries()).sort((a, b) => a[1].layer - b[1].layer) as [key, layerStat]}
        <div class="layer-item">
            <input
                type="checkbox"
                checked={layerVisibility[key] ?? true}
                onchange={() => toggleLayer(key)}
            />
            <div class="layer-color" style="background-color: {getLayerColor(layerStat.layer)}"></div>
            <span class="layer-name">{layerStat.layer}:{layerStat.datatype}</span>
            <span class="layer-count">{layerStat.polygonCount.toLocaleString()}</span>
        </div>
        {/each}
    </div>
</div>
{/if}

<script lang="ts">
function getLayerColor(layer: number): string {
    // Simple color mapping (can be customized)
    const hue = (layer * 137.5) % 360; // Golden angle for good distribution
    return `hsl(${hue}, 70%, 50%)`;
}
</script>

<style>
.layer-panel {
    position: fixed;
    bottom: 10px;
    left: 10px;
    width: 280px;
    max-height: 400px;
    background: rgba(0, 0, 0, 0.9);
    color: #ccc;
    border-radius: 4px;
    font-family: monospace;
    font-size: 12px;
    z-index: 1000;
    display: flex;
    flex-direction: column;
}

.panel-header {
    padding: 12px;
    border-bottom: 1px solid #444;
}

h3 {
    margin: 0 0 8px 0;
    font-size: 14px;
    color: #fff;
}

.sync-toggle {
    margin-bottom: 8px;
    padding: 6px;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 3px;
}

.sync-toggle label {
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
}

.sync-label {
    font-size: 11px;
    color: #aaa;
}

.sync-toggle input[type="checkbox"]:checked + .sync-label {
    color: #4a9eff;
}

.bulk-actions {
    display: flex;
    gap: 8px;
}

.bulk-actions button {
    flex: 1;
    padding: 4px 8px;
    background: #333;
    color: #ccc;
    border: 1px solid #555;
    border-radius: 3px;
    cursor: pointer;
    font-size: 11px;
}

.bulk-actions button:hover {
    background: #444;
}

.layer-list {
    overflow-y: auto;
    padding: 8px;
}

.layer-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px;
    margin: 2px 0;
    border-radius: 3px;
}

.layer-item:hover {
    background: rgba(255, 255, 255, 0.05);
}

.layer-color {
    width: 16px;
    height: 16px;
    border-radius: 2px;
    border: 1px solid #666;
}

.layer-name {
    flex: 1;
    color: #aaa;
}

.layer-count {
    color: #0f0;
    font-size: 11px;
}

input[type="checkbox"] {
    cursor: pointer;
}
</style>
```

**Modified Method** (`PixiRenderer.ts`):
```typescript
private layerVisibility: Map<string, boolean> = new Map();

constructor() {
    // ... existing code ...

    // Listen for layer visibility changes
    window.addEventListener('layer-visibility-changed', (e: Event) => {
        const customEvent = e as CustomEvent;
        this.updateLayerVisibility(customEvent.detail.visibility);
    });
}

private updateLayerVisibility(visibility: { [key: string]: boolean }): void {
    // Update internal visibility map
    this.layerVisibility.clear();
    for (const [key, visible] of Object.entries(visibility)) {
        this.layerVisibility.set(key, visible);
    }

    // Update graphics visibility (combines layer visibility + viewport culling)
    this.performViewportUpdate();

    console.log('[PixiRenderer] Layer visibility updated');
}
```

**Key Implementation Notes**:
1. **Excluded from Budget**: Hidden layers not counted in `getPerformanceMetrics()`
2. **Combined Filtering**: `performViewportUpdate()` checks both viewport and layer visibility
3. **Sync Toggle**: User can enable/disable sync with other users
4. **Local by Default**: Sync disabled by default (users have independent layer views)
5. **Y.js Integration**: When sync enabled, layer visibility synced via Y.js (Week 2)

**Modified RTreeItem** (`src/lib/spatial/RTree.ts`):
```typescript
export interface RTreeItem {
    id: string;
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    data: unknown;
    layer?: number;      // Add layer info
    datatype?: number;   // Add datatype info
}
```

**Estimated Complexity**: Medium (3-4 hours)

---

## 6. Implementation Priority and Timeline

### Week 1 (Critical Path)
- **P0**: Adaptive LOD System with Zoom Thresholds (3-4 hours)
  - Includes incremental re-render implementation
  - Zoom-based triggering (0.2x / 2.0x thresholds)
  - Layer visibility integration
- **P0**: Performance Metrics Display with 'P' Toggle (1-2 hours)
  - Positioned below FPS counter
  - Shows LOD thresholds and layer-aware polygon count
- **P1**: File Statistics Panel (2 hours)
  - Integrated below Performance Panel
  - Shares 'P' key toggle

**Total Week 1 Effort**: 6-8 hours

### Week 2 (Enhancement)
- **P2**: File Upload Improvements (1 hour)
  - Clear after parse (not before)
  - Better error handling
- **P2**: Layer Visibility Control Panel (3-4 hours)
  - Sync/desync toggle
  - Exclude hidden layers from budget
  - Y.js integration for sync mode
- **P2**: Advanced LOD Optimizations
  - Per-cell depth tracking
  - Spatial LOD (different depths in different regions)

**Total Week 2 Effort**: 4-5 hours

---

## 7. Technical Risks and Mitigations

### 7.1 LOD Thrashing

**Risk**: Rapid depth changes cause stuttering

**Mitigation**:
- 1-second cooldown between changes
- Exponential moving average for stability
- Hysteresis thresholds (30% / 90%)
- **Zoom thresholds (0.2x / 2.0x)** - only trigger on significant zoom changes

### 7.2 Re-render Performance

**Risk**: Re-render on LOD change causes UI freeze

**Mitigation**:
- **Incremental re-render** (Week 1) - only clear and re-render geometry, not parse
- Show loading indicator during re-render
- Significantly faster than full reload (seconds vs. minutes)
- Future: Track depth per item for true incremental updates

### 7.3 Memory Leaks

**Risk**: Graphics objects not properly destroyed

**Mitigation**:
- Explicit destroy() calls in clear() and clearInstanceGraphics() methods
- Monitor heap size in performance panel (if `performance.memory` available)
- Clear renderer only after successful parse (preserve on error)

### 7.4 Layer Visibility Performance

**Risk**: Updating 100K+ graphics on layer toggle is slow

**Mitigation**:
- Reuse existing `performViewportUpdate()` for combined filtering
- Single pass through all graphics items
- No separate layer update loop needed

---

## 8. Success Criteria

### Week 1 Completion Criteria
- [ ] Adaptive LOD implemented with zoom thresholds (0.2x / 2.0x)
- [ ] Incremental re-render working (shows loading indicator)
- [ ] Performance metrics panel toggleable with 'P' key
- [ ] File statistics panel integrated below performance panel
- [ ] Layer visibility excluded from polygon budget
- [ ] LOD maintains 30fps with 100K visible polygons
- [ ] No OOM crashes with 500MB files

### Week 2 Completion Criteria
- [ ] File upload clears after parse (not before)
- [ ] Layer visibility control with sync/desync toggle
- [ ] Hidden layers excluded from LOD calculations
- [ ] Y.js integration for synced layer visibility
- [ ] Performance optimizations documented

---

## 9. Future Enhancements (Post-MVP)

1. **Advanced LOD**:
   - Per-cell polygon budgets (allocate budget based on cell importance)
   - Spatial LOD (different depths in different viewport regions)
   - Predictive LOD (pre-render based on pan direction)
   - True incremental re-render (track depth per graphics item)

2. **Performance**:
   - Web Worker for parsing (offload from main thread)
   - OffscreenCanvas for rendering (if browser support improves)
   - Geometry instancing for repeated cells (Pixi.js Container reuse)
   - Texture atlas for layer colors (reduce draw calls)

3. **Layer Management**:
   - Custom layer colors (user-defined color schemes)
   - Layer groups (organize related layers)
   - Layer search/filter (find layers by name/number)
   - Save/load layer configurations (persist user preferences)
   - Layer opacity control (semi-transparent layers)

4. **Analytics**:
   - Performance profiling dashboard (detailed metrics over time)
   - Render time heatmaps (identify slow regions)
   - Polygon density visualization (color-code by density)
   - LOD change history (track depth changes over session)

---

## 10. References

- **Parent Document**: DevLog-001-mvp-implementation-plan.md
- **Related Code**:
  - `src/lib/renderer/PixiRenderer.ts` - Main rendering engine with LOD logic
  - `src/lib/gds/GDSParser.ts` - GDSII parser with statistics collection
  - `src/lib/spatial/RTree.ts` - Spatial indexing for viewport culling
  - `src/types/gds.ts` - Type definitions for GDS data structures
  - `src/stores/gdsStore.ts` - Global state management
  - `src/stores/layerStore.ts` - Layer visibility state

- **External Resources**:
  - Pixi.js Performance Guide: https://pixijs.com/guides/production/performance-tips
  - R-tree Spatial Index: https://github.com/mourner/rbush
  - Web Performance APIs: https://developer.mozilla.org/en-US/docs/Web/API/Performance
  - Svelte 5 Runes: https://svelte.dev/docs/svelte/what-are-runes

---

## 11. Changelog

- **v2.0 (2025-11-22)**: Major update based on codebase analysis and user feedback
  - **Added zoom-based LOD triggering** (0.2x / 2.0x thresholds)
  - **Changed to incremental re-render** (Week 1, not Week 2)
  - **Integrated Performance Panel below FPS counter** with 'P' key toggle
  - **Integrated File Statistics below Performance Panel** (shared toggle)
  - **Added layer visibility exclusion** from polygon budget
  - **Added sync/desync toggle** for layer visibility
  - **Changed file upload to clear after parse** (not before)
  - **Removed testing sections** (deferred)
  - Updated timeline and effort estimates
  - Added detailed implementation notes for all features

- **v1.0 (2025-11-22)**: Initial implementation plan created
  - Defined adaptive LOD algorithm based on visible polygon count
  - Specified performance metrics display requirements
  - Detailed file statistics panel implementation
  - Outlined file upload improvements
  - Designed layer visibility control panel
  - Established testing strategy and success criteria


