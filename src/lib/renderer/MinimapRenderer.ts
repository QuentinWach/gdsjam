/**
 * MinimapRenderer - Renders a simplified overview of the GDS document
 *
 * Features:
 * - Separate PIXI Application instance (independent from main canvas)
 * - LOD culling: skips cells marked with skipInMinimap (< 1% of layout extent)
 * - Viewport outline: shows current main canvas viewport as a rectangle
 * - Click-to-navigate: clicking on minimap centers main viewport on that location
 * - Only re-renders on document load or layer visibility/color changes
 */

import { Application, Container, Graphics } from "pixi.js";
import type { BoundingBox, Cell, GDSDocument } from "../../types/gds";
import { DEBUG } from "../config";

export interface MinimapRenderStats {
	polygonCount: number;
	cellsSkipped: number;
	lastRenderTimeMs: number;
}

export class MinimapRenderer {
	private app: Application | null = null;
	private mainContainer: Container | null = null;
	private viewportOutline: Graphics | null = null;
	private isInitialized = false;

	// Document state
	private documentBounds: BoundingBox | null = null;
	private lastViewportBounds: BoundingBox | null = null;
	private canvas: HTMLCanvasElement | null = null;

	// Render stats
	private stats: MinimapRenderStats = {
		polygonCount: 0,
		cellsSkipped: 0,
		lastRenderTimeMs: 0,
	};

	// Callback for click-to-navigate
	private onNavigateCallback: ((worldX: number, worldY: number) => void) | null = null;

	/**
	 * Initialize the minimap renderer with a canvas element
	 */
	async init(canvas: HTMLCanvasElement): Promise<void> {
		if (this.isInitialized) {
			return;
		}

		// Store canvas reference for resize
		this.canvas = canvas;

		this.app = new Application();
		await this.app.init({
			canvas,
			width: canvas.width,
			height: canvas.height,
			backgroundColor: 0x1a1a1a,
			antialias: true,
			resolution: 1, // Use resolution 1 for simplicity - avoid CSS scaling issues
		});

		this.mainContainer = new Container();
		this.app.stage.addChild(this.mainContainer);

		// Viewport outline (drawn on top)
		this.viewportOutline = new Graphics();
		this.app.stage.addChild(this.viewportOutline);

		// Click handler for navigation
		this.app.stage.eventMode = "static";
		this.app.stage.hitArea = this.app.screen;
		this.app.stage.on("pointerdown", this.handleClick.bind(this));

		this.isInitialized = true;

		if (DEBUG) {
			console.log("[MinimapRenderer] Initialized with size:", canvas.width, "x", canvas.height);
		}
	}

	/**
	 * Set callback for click-to-navigate
	 */
	setOnNavigate(callback: ((worldX: number, worldY: number) => void) | null): void {
		this.onNavigateCallback = callback;
	}

	/**
	 * Handle click on minimap - convert to world coordinates and navigate
	 */
	private handleClick(event: { global: { x: number; y: number } }): void {
		if (!this.documentBounds || !this.mainContainer || !this.app) {
			return;
		}

		const screenX = event.global.x;
		const screenY = event.global.y;

		// Convert screen coordinates to world coordinates
		const worldX = (screenX - this.mainContainer.x) / this.mainContainer.scale.x;
		const worldY = (screenY - this.mainContainer.y) / this.mainContainer.scale.y;

		if (DEBUG) {
			console.log(
				`[MinimapRenderer] Click at screen (${screenX}, ${screenY}) -> world (${worldX}, ${worldY})`,
			);
		}

		this.onNavigateCallback?.(worldX, worldY);
	}

	/**
	 * Render the GDS document to the minimap
	 */
	async render(
		document: GDSDocument,
		layerVisibility: Map<string, boolean>,
		layerColors: Map<string, number>,
	): Promise<void> {
		if (!this.isInitialized || !this.app || !this.mainContainer) {
			console.warn("[MinimapRenderer] Not initialized");
			return;
		}

		const startTime = performance.now();
		this.documentBounds = document.boundingBox;

		if (DEBUG) {
			console.log("[MinimapRenderer] Document bounds:", this.documentBounds);
			console.log("[MinimapRenderer] Cells:", document.cells.size);
			console.log("[MinimapRenderer] Layer visibility entries:", layerVisibility.size);
			console.log("[MinimapRenderer] Layer color entries:", layerColors.size);
		}

		// Clear previous content
		this.mainContainer.removeChildren();

		// Reset stats
		this.stats.polygonCount = 0;
		this.stats.cellsSkipped = 0;

		// Check for valid bounds
		if (
			!this.documentBounds ||
			this.documentBounds.maxX <= this.documentBounds.minX ||
			this.documentBounds.maxY <= this.documentBounds.minY
		) {
			console.warn("[MinimapRenderer] Invalid document bounds:", this.documentBounds);
			return;
		}

		// Fit document to minimap canvas
		this.fitToView();

		// Render all cells (skipping those marked for LOD culling)
		await this.renderCells(document, layerVisibility, layerColors);

		this.stats.lastRenderTimeMs = performance.now() - startTime;

		if (DEBUG) {
			console.log(
				`[MinimapRenderer] Rendered ${this.stats.polygonCount} polygons, ` +
					`skipped ${this.stats.cellsSkipped} cells, took ${this.stats.lastRenderTimeMs.toFixed(1)}ms`,
			);
		}
	}

	/**
	 * Fit document bounds to minimap canvas
	 */
	private fitToView(): void {
		if (!this.app || !this.mainContainer || !this.documentBounds) {
			return;
		}

		const bounds = this.documentBounds;
		const docWidth = bounds.maxX - bounds.minX;
		const docHeight = bounds.maxY - bounds.minY;

		if (docWidth <= 0 || docHeight <= 0) {
			return;
		}

		const screenWidth = this.app.screen.width;
		const screenHeight = this.app.screen.height;
		const padding = 10; // pixels

		// Calculate scale to fit with padding
		const scaleX = (screenWidth - padding * 2) / docWidth;
		const scaleY = (screenHeight - padding * 2) / docHeight;
		const scale = Math.min(scaleX, scaleY);

		// Apply scale (Y-flip for GDS coordinates)
		this.mainContainer.scale.set(scale, -scale);

		// Center the document
		// With Y-flip, we need to position so the document center maps to screen center
		const centerX = (bounds.minX + bounds.maxX) / 2;
		const centerY = (bounds.minY + bounds.maxY) / 2;

		// Container position: screen_center - doc_center * scale
		// For Y with flip: we add because the scale is negative
		this.mainContainer.x = screenWidth / 2 - centerX * scale;
		this.mainContainer.y = screenHeight / 2 + centerY * scale;

		if (DEBUG) {
			console.log("[MinimapRenderer] fitToView:", {
				screenWidth,
				screenHeight,
				docWidth,
				docHeight,
				scale,
				containerX: this.mainContainer.x,
				containerY: this.mainContainer.y,
				centerX,
				centerY,
			});
		}
	}

	/**
	 * Render all cells with LOD culling
	 */
	private async renderCells(
		document: GDSDocument,
		layerVisibility: Map<string, boolean>,
		layerColors: Map<string, number>,
	): Promise<void> {
		if (!this.mainContainer) return;

		// Use document's topCells if available, otherwise find them
		let topCells: Cell[] = [];
		if (document.topCells && document.topCells.length > 0) {
			for (const cellName of document.topCells) {
				const cell = document.cells.get(cellName);
				if (cell) topCells.push(cell);
			}
		} else {
			// Fallback: find top-level cells by checking references
			const referencedCells = new Set<string>();
			for (const cell of document.cells.values()) {
				for (const instance of cell.instances) {
					referencedCells.add(instance.cellRef);
				}
			}
			topCells = Array.from(document.cells.values()).filter(
				(cell) => !referencedCells.has(cell.name),
			);
		}

		if (DEBUG) {
			console.log(
				"[MinimapRenderer] Top cells to render:",
				topCells.map((c) => c.name),
			);
		}

		// Batch all polygons by layer for efficient rendering
		const layerGraphics = new Map<string, Graphics>();

		for (const cell of topCells) {
			await this.renderCellRecursive(
				cell,
				document,
				0,
				0,
				0,
				false,
				1,
				layerVisibility,
				layerColors,
				layerGraphics,
				0,
			);
		}

		if (DEBUG) {
			console.log("[MinimapRenderer] Layer graphics created:", layerGraphics.size);
		}

		// Add all layer graphics to container
		for (const graphics of layerGraphics.values()) {
			this.mainContainer.addChild(graphics);
		}
	}

	/**
	 * Recursively render a cell and its instances
	 */
	private async renderCellRecursive(
		cell: Cell,
		document: GDSDocument,
		x: number,
		y: number,
		rotation: number,
		mirror: boolean,
		magnification: number,
		layerVisibility: Map<string, boolean>,
		layerColors: Map<string, number>,
		layerGraphics: Map<string, Graphics>,
		depth: number,
	): Promise<void> {
		// LOD culling: skip small cells
		if (cell.skipInMinimap) {
			this.stats.cellsSkipped++;
			return;
		}

		// Limit recursion depth for performance
		const MAX_DEPTH = 10;
		if (depth > MAX_DEPTH) {
			return;
		}

		// Render direct polygons
		for (const polygon of cell.polygons) {
			const layerKey = `${polygon.layer}:${polygon.datatype}`;

			// Check visibility
			const isVisible = layerVisibility.get(layerKey) ?? true;
			if (!isVisible) continue;

			// Get or create graphics for this layer
			let graphics = layerGraphics.get(layerKey);
			if (!graphics) {
				graphics = new Graphics();
				layerGraphics.set(layerKey, graphics);
			}

			// Get layer color
			const color = layerColors.get(layerKey) ?? 0x888888;

			// Debug first polygon
			if (DEBUG && this.stats.polygonCount === 0) {
				console.log("[MinimapRenderer] First polygon:", {
					layerKey,
					color: color.toString(16),
					numPoints: polygon.points.length,
					firstPoint: polygon.points[0],
					bbox: polygon.boundingBox,
				});
			}

			// Transform and draw polygon points (polygon.points is Point[] with .x, .y)
			const firstPoint = polygon.points[0];
			if (polygon.points.length > 0 && firstPoint) {
				const firstPt = this.transformPoint(
					firstPoint.x,
					firstPoint.y,
					x,
					y,
					rotation,
					mirror,
					magnification,
				);
				graphics.moveTo(firstPt.x, firstPt.y);

				for (let i = 1; i < polygon.points.length; i++) {
					const point = polygon.points[i];
					if (point) {
						const pt = this.transformPoint(point.x, point.y, x, y, rotation, mirror, magnification);
						graphics.lineTo(pt.x, pt.y);
					}
				}
				graphics.closePath();
				graphics.fill({ color, alpha: 0.8 });
			}

			this.stats.polygonCount++;
		}

		// Render child instances
		for (const instance of cell.instances) {
			const refCell = document.cells.get(instance.cellRef);
			if (!refCell) continue;

			// Calculate transformed position
			const rad = (rotation * Math.PI) / 180;
			const cos = Math.cos(rad);
			const sin = Math.sin(rad);
			const mx = mirror ? -1 : 1;

			const newX = x + (instance.x * cos * mx - instance.y * sin) * magnification;
			const newY = y + (instance.x * sin * mx + instance.y * cos) * magnification;
			const newRotation = rotation + instance.rotation;
			const newMirror = mirror !== instance.mirror;
			const newMagnification = magnification * instance.magnification;

			await this.renderCellRecursive(
				refCell,
				document,
				newX,
				newY,
				newRotation,
				newMirror,
				newMagnification,
				layerVisibility,
				layerColors,
				layerGraphics,
				depth + 1,
			);
		}
	}

	/**
	 * Transform a single point by position, rotation, mirror, and magnification
	 */
	private transformPoint(
		px: number,
		py: number,
		x: number,
		y: number,
		rotation: number,
		mirror: boolean,
		magnification: number,
	): { x: number; y: number } {
		const rad = (rotation * Math.PI) / 180;
		const cos = Math.cos(rad);
		const sin = Math.sin(rad);
		const mx = mirror ? -1 : 1;

		// Apply transformation: mirror, rotate, scale, translate
		const rx = (px * cos * mx - py * sin) * magnification + x;
		const ry = (px * sin * mx + py * cos) * magnification + y;

		return { x: rx, y: ry };
	}

	/**
	 * Update viewport outline to show current main canvas viewport
	 */
	updateViewportOutline(viewportBounds: BoundingBox): void {
		console.log("[MinimapRenderer] updateViewportOutline called", {
			hasOutline: !!this.viewportOutline,
			hasContainer: !!this.mainContainer,
			hasApp: !!this.app,
			viewportBounds,
		});

		if (!this.viewportOutline || !this.mainContainer || !this.app) {
			return;
		}

		this.lastViewportBounds = viewportBounds;
		this.viewportOutline.clear();

		// Transform viewport bounds to minimap screen coordinates
		const scale = this.mainContainer.scale.x;
		const offsetX = this.mainContainer.x;
		const offsetY = this.mainContainer.y;

		// Convert world coordinates to screen coordinates
		// World Y increases up, screen Y increases down
		const x1 = viewportBounds.minX * scale + offsetX;
		const x2 = viewportBounds.maxX * scale + offsetX;
		// For Y: with -scale on container, world Y becomes inverted on screen
		const y1 = viewportBounds.minY * -scale + offsetY;
		const y2 = viewportBounds.maxY * -scale + offsetY;

		// y1 should be > y2 because minY (bottom) maps to larger screen Y
		const left = Math.min(x1, x2);
		const top = Math.min(y1, y2);
		const width = Math.abs(x2 - x1);
		const height = Math.abs(y2 - y1);

		console.log("[MinimapRenderer] Drawing viewport rect:", {
			left,
			top,
			width,
			height,
			scale,
			offsetX,
			offsetY,
		});

		// Draw viewport rectangle - use a thicker line to ensure visibility
		this.viewportOutline.rect(left, top, width, height);
		this.viewportOutline.stroke({ color: 0xff0000, width: 3, alpha: 1.0 }); // Red, thicker, fully opaque
	}

	/**
	 * Get render statistics
	 */
	getStats(): MinimapRenderStats {
		return { ...this.stats };
	}

	/**
	 * Resize the minimap canvas
	 */
	resize(width: number, height: number): void {
		if (!this.app || !this.canvas) return;

		// Update canvas element size
		this.canvas.width = width;
		this.canvas.height = height;

		// Resize PixiJS renderer
		this.app.renderer.resize(width, height);

		// Update stage hit area after resize
		this.app.stage.hitArea = this.app.screen;

		if (DEBUG) {
			console.log(
				"[MinimapRenderer] Resized to:",
				width,
				"x",
				height,
				"screen:",
				this.app.screen.width,
				"x",
				this.app.screen.height,
			);
		}

		this.fitToView();

		// Re-render viewport outline if we have document bounds
		if (this.documentBounds && this.lastViewportBounds) {
			this.updateViewportOutline(this.lastViewportBounds);
		}
	}

	/**
	 * Destroy the renderer and clean up resources
	 */
	destroy(): void {
		if (this.app) {
			this.app.destroy(true, { children: true, texture: true });
			this.app = null;
		}
		this.mainContainer = null;
		this.viewportOutline = null;
		this.documentBounds = null;
		this.lastViewportBounds = null;
		this.isInitialized = false;
	}
}
