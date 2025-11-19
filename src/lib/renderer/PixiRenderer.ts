/**
 * Pixi.js WebGL Renderer for GDSII layouts
 * Implements viewport culling, zoom/pan controls, and FPS monitoring
 */

import { Application, Container, Graphics, Text } from "pixi.js";
import type { BoundingBox, Cell, GDSDocument, Polygon } from "../../types/gds";
import { DEBUG, FPS_UPDATE_INTERVAL, MAX_POLYGONS_PER_RENDER } from "../config";
import { type RTreeItem, SpatialIndex } from "../spatial/RTree";

export interface ViewportState {
	x: number;
	y: number;
	scale: number;
}

export type RenderProgressCallback = (progress: number, message: string) => void;

export class PixiRenderer {
	private app: Application;
	private mainContainer: Container;
	private gridContainer: Container;
	private spatialIndex: SpatialIndex;
	private fpsText: Text;
	private scaleBarContainer: Container;
	private lastFrameTime: number;
	private frameCount: number;
	private fpsUpdateInterval: number;
	private allGraphicsItems: RTreeItem[] = [];
	private isInitialized = false;
	private maxPolygonsPerRender = MAX_POLYGONS_PER_RENDER;
	private currentRenderDepth = 0;
	private gridVisible = true;
	private documentUnits = { database: 1e-9, user: 1e-6 };

	constructor() {
		this.app = new Application();
		this.mainContainer = new Container();
		this.gridContainer = new Container();
		this.scaleBarContainer = new Container();
		this.spatialIndex = new SpatialIndex();
		this.lastFrameTime = performance.now();
		this.frameCount = 0;
		this.fpsUpdateInterval = FPS_UPDATE_INTERVAL;

		this.fpsText = new Text({
			text: "FPS: 0",
			style: {
				fontFamily: "monospace",
				fontSize: 14,
				fill: 0x00ff00,
			},
		});
	}

	/**
	 * Initialize the renderer
	 */
	async init(canvas: HTMLCanvasElement): Promise<void> {
		const parentElement = canvas.parentElement;
		// biome-ignore lint/suspicious/noExplicitAny: Pixi.js Application init options are complex
		const initOptions: any = {
			canvas,
			background: 0x1a1a1a,
			antialias: true,
			autoDensity: true,
			resolution: window.devicePixelRatio || 1,
		};

		if (parentElement) {
			initOptions.resizeTo = parentElement;
		}

		await this.app.init(initOptions);

		// Add containers in order: grid, main content, UI overlays
		this.app.stage.addChild(this.gridContainer);
		this.app.stage.addChild(this.mainContainer);

		// Flip Y-axis to match GDSII coordinate system
		this.mainContainer.scale.y = -1;
		this.gridContainer.scale.y = -1;

		// Add UI overlays
		this.fpsText.x = this.app.screen.width - 80;
		this.fpsText.y = 10;
		this.app.stage.addChild(this.fpsText);
		this.app.stage.addChild(this.scaleBarContainer);

		this.app.ticker.add(this.onTick.bind(this));
		this.mainContainer.eventMode = "static";

		this.isInitialized = true;
		this.setupControls();
		this.updateGrid();
		this.updateScaleBar();
	}

	/**
	 * Render loop tick
	 */
	private onTick(): void {
		this.frameCount++;
		const now = performance.now();
		const elapsed = now - this.lastFrameTime;

		if (elapsed >= this.fpsUpdateInterval) {
			const fps = Math.round((this.frameCount * 1000) / elapsed);
			this.fpsText.text = `FPS: ${fps}`;
			this.frameCount = 0;
			this.lastFrameTime = now;
		}

		// Update FPS text position if window resized
		this.fpsText.x = this.app.screen.width - 80;
	}

	/**
	 * Setup zoom and pan controls
	 */
	private setupControls(): void {
		// Mouse wheel zoom
		this.app.canvas.addEventListener("wheel", (e) => {
			e.preventDefault();
			const delta = e.deltaY;
			const zoomFactor = delta > 0 ? 0.9 : 1.1;

			// Zoom to cursor position
			const mouseX = e.offsetX;
			const mouseY = e.offsetY;

			const worldPos = {
				x: (mouseX - this.mainContainer.x) / this.mainContainer.scale.x,
				y: (mouseY - this.mainContainer.y) / this.mainContainer.scale.y,
			};

			// Preserve Y-axis flip while zooming
			const currentYSign = Math.sign(this.mainContainer.scale.y);
			this.mainContainer.scale.x *= zoomFactor;
			this.mainContainer.scale.y = Math.abs(this.mainContainer.scale.y) * zoomFactor * currentYSign;

			this.mainContainer.x = mouseX - worldPos.x * this.mainContainer.scale.x;
			this.mainContainer.y = mouseY - worldPos.y * this.mainContainer.scale.y;

			this.updateViewport();
			this.updateGrid();
			this.updateScaleBar();
		});

		// Pan with middle mouse or Space + drag
		let isPanning = false;
		let lastMouseX = 0;
		let lastMouseY = 0;
		let isSpacePressed = false;

		window.addEventListener("keydown", (e) => {
			if (e.code === "Space") {
				isSpacePressed = true;
				e.preventDefault();
			}
		});

		window.addEventListener("keyup", (e) => {
			if (e.code === "Space") {
				isSpacePressed = false;
			}
		});

		this.app.canvas.addEventListener("mousedown", (e) => {
			if (e.button === 1 || (e.button === 0 && isSpacePressed)) {
				isPanning = true;
				lastMouseX = e.clientX;
				lastMouseY = e.clientY;
				e.preventDefault();
			}
		});

		window.addEventListener("mousemove", (e) => {
			if (isPanning) {
				const dx = e.clientX - lastMouseX;
				const dy = e.clientY - lastMouseY;

				this.mainContainer.x += dx;
				this.mainContainer.y += dy;

				lastMouseX = e.clientX;
				lastMouseY = e.clientY;

				this.updateViewport();
				this.updateGrid();
				this.updateScaleBar();
			}
		});

		window.addEventListener("mouseup", () => {
			isPanning = false;
		});
	}

	/**
	 * Update viewport (called after zoom/pan)
	 * Implements viewport culling - only shows polygons visible in current viewport
	 */
	private updateViewport(): void {
		if (this.allGraphicsItems.length === 0) {
			return;
		}

		const viewportBounds = this.getViewportBounds();
		const visibleItems = this.spatialIndex.query(viewportBounds);
		const visibleIds = new Set(visibleItems.map((item) => item.id));

		// Update visibility of all graphics items
		let visibleCount = 0;
		for (const item of this.allGraphicsItems) {
			const graphics = item.data as Graphics;
			const isVisible = visibleIds.has(item.id);
			graphics.visible = isVisible;
			if (isVisible) visibleCount++;
		}

		if (DEBUG) {
			console.log(
				`[PixiRenderer] Viewport culling: ${visibleCount}/${this.allGraphicsItems.length} polygons visible`,
			);
		}
	}

	/**
	 * Get current viewport bounds in world coordinates
	 */
	private getViewportBounds(): BoundingBox {
		const scale = this.mainContainer.scale.x;
		const scaleY = this.mainContainer.scale.y;
		const x = -this.mainContainer.x / scale;
		const y = -this.mainContainer.y / scaleY;
		const width = this.app.screen.width / scale;
		const height = this.app.screen.height / Math.abs(scaleY);

		// Account for Y-axis flip
		if (scaleY < 0) {
			return {
				minX: x,
				minY: y - height,
				maxX: x + width,
				maxY: y,
			};
		}

		return {
			minX: x,
			minY: y,
			maxX: x + width,
			maxY: y + height,
		};
	}

	/**
	 * Update grid overlay
	 */
	private updateGrid(): void {
		this.gridContainer.removeChildren();
		if (!this.gridVisible) return;

		const bounds = this.getViewportBounds();
		const scale = this.mainContainer.scale.x;

		// Calculate grid spacing (powers of 10)
		const viewWidth = bounds.maxX - bounds.minX;
		const targetLines = 10;
		const rawSpacing = viewWidth / targetLines;
		const gridSpacing = 10 ** Math.floor(Math.log10(rawSpacing));

		const graphics = new Graphics();
		graphics.setStrokeStyle({ width: 1 / scale, color: 0x333333, alpha: 0.3 });

		// Vertical lines
		const startX = Math.floor(bounds.minX / gridSpacing) * gridSpacing;
		for (let x = startX; x <= bounds.maxX; x += gridSpacing) {
			graphics.moveTo(x, bounds.minY);
			graphics.lineTo(x, bounds.maxY);
		}
		graphics.stroke();

		// Horizontal lines
		const startY = Math.floor(bounds.minY / gridSpacing) * gridSpacing;
		for (let y = startY; y <= bounds.maxY; y += gridSpacing) {
			graphics.moveTo(bounds.minX, y);
			graphics.lineTo(bounds.maxX, y);
		}
		graphics.stroke();

		this.gridContainer.addChild(graphics);
		this.gridContainer.position.copyFrom(this.mainContainer.position);
		this.gridContainer.scale.copyFrom(this.mainContainer.scale);
	}

	/**
	 * Update scale bar
	 */
	private updateScaleBar(): void {
		this.scaleBarContainer.removeChildren();

		const bounds = this.getViewportBounds();
		const viewWidthDB = bounds.maxX - bounds.minX;

		// Convert database units to micrometers
		// Coordinates are in database units (typically nanometers)
		// database unit = database meters, user unit = user meters
		// To convert to µm: db_units * (database / user) because user is typically 1e-6 (1 µm)
		const dbToUserUnits = this.documentUnits.database / this.documentUnits.user;
		const viewWidthUserUnits = viewWidthDB * dbToUserUnits;

		// User units are typically micrometers (1e-6 meters)
		const viewWidthMicrometers = viewWidthUserUnits;

		// Calculate nice round number for bar width in micrometers
		const barWidthMicrometers = 10 ** Math.floor(Math.log10(viewWidthMicrometers / 4));

		// Convert back to database units for pixel calculation
		const barWidthDB = barWidthMicrometers / dbToUserUnits;
		const barWidthPixels = barWidthDB * this.mainContainer.scale.x;

		const graphics = new Graphics();
		const x = 20;
		const y = this.app.screen.height - 40;

		// Draw bar
		graphics.rect(x, y, barWidthPixels, 4);
		graphics.fill({ color: 0xffffff, alpha: 0.7 });

		// Draw ticks
		graphics.rect(x, y - 4, 2, 12);
		graphics.fill({ color: 0xffffff, alpha: 0.7 });
		graphics.rect(x + barWidthPixels - 2, y - 4, 2, 12);
		graphics.fill({ color: 0xffffff, alpha: 0.7 });

		this.scaleBarContainer.addChild(graphics);

		// Add label with proper formatting
		let labelText: string;
		if (barWidthMicrometers >= 1000) {
			labelText = `${(barWidthMicrometers / 1000).toFixed(0)} mm`;
		} else if (barWidthMicrometers >= 1) {
			labelText = `${barWidthMicrometers.toFixed(0)} µm`;
		} else {
			labelText = `${(barWidthMicrometers * 1000).toFixed(0)} nm`;
		}

		const label = new Text({
			text: labelText,
			style: {
				fontFamily: "monospace",
				fontSize: 12,
				fill: 0xffffff,
			},
		});
		label.x = x;
		label.y = y + 8;
		this.scaleBarContainer.addChild(label);
	}

	/**
	 * Toggle grid visibility
	 */
	toggleGrid(): void {
		this.gridVisible = !this.gridVisible;
		this.updateGrid();
	}

	/**
	 * Render GDS document with LOD (Level of Detail) to prevent OOM
	 */
	async renderGDSDocument(
		document: GDSDocument,
		onProgress?: RenderProgressCallback,
	): Promise<void> {
		console.log("[PixiRenderer] Rendering GDS document:", document.name);
		console.log(
			`[PixiRenderer] ${document.cells.size} cells, ${document.layers.size} layers, ${document.topCells.length} top cells`,
		);

		this.documentUnits = document.units;

		onProgress?.(0, "Preparing to render...");
		await new Promise((resolve) => setTimeout(resolve, 0));
		this.clear();

		const startTime = performance.now();
		this.currentRenderDepth = 0;
		let totalPolygons = 0;
		let polygonBudget = this.maxPolygonsPerRender;

		const topCellCount = document.topCells.length;
		for (let i = 0; i < topCellCount; i++) {
			const topCellName = document.topCells[i];
			if (!topCellName) continue;
			const cell = document.cells.get(topCellName);

			if (cell) {
				const progress = Math.floor((i / topCellCount) * 80);
				onProgress?.(progress, `Rendering cell ${i + 1}/${topCellCount}...`);
				await new Promise((resolve) => setTimeout(resolve, 0));

				if (DEBUG) {
					console.log(
						`[PixiRenderer] Rendering top cell: ${topCellName} (${cell.polygons.length} polygons, ${cell.instances.length} instances)`,
					);
				}

				const rendered = this.renderCellGeometry(
					cell,
					document,
					0,
					0,
					0,
					false,
					1,
					this.currentRenderDepth,
					polygonBudget,
				);
				totalPolygons += rendered;
				polygonBudget -= rendered;

				if (polygonBudget <= 0) {
					console.warn(
						`[PixiRenderer] Polygon budget exhausted (${this.maxPolygonsPerRender}), stopping render`,
					);
					break;
				}
			}
		}

		const renderTime = performance.now() - startTime;
		console.log(
			`[PixiRenderer] Rendered ${totalPolygons} polygons in ${renderTime.toFixed(0)}ms (${this.allGraphicsItems.length} Graphics objects, depth=${this.currentRenderDepth})`,
		);

		onProgress?.(90, "Fitting to view...");
		await new Promise((resolve) => setTimeout(resolve, 0));
		this.fitToView();
		this.updateViewport();

		onProgress?.(100, "Render complete!");
		console.log("[PixiRenderer] Initial render complete");
	}

	/**
	 * Render cell geometry with transformations (batched by layer)
	 * Returns number of polygons rendered (including instances)
	 *
	 * @param maxDepth - Maximum hierarchy depth to render (0 = only this cell's polygons)
	 * @param polygonBudget - Maximum polygons to render (stops early if exceeded)
	 */
	private renderCellGeometry(
		cell: Cell,
		document: GDSDocument,
		x: number,
		y: number,
		rotation: number,
		mirror: boolean,
		magnification: number,
		maxDepth: number,
		polygonBudget: number,
	): number {
		if (DEBUG) {
			console.log(
				`[PixiRenderer] renderCellGeometry: ${cell.name} at (${x}, ${y}) depth=${maxDepth} budget=${polygonBudget}`,
			);
		}

		// Stop if budget exhausted
		if (polygonBudget <= 0) {
			return 0;
		}

		// Create container for this cell
		const cellContainer = new Container();
		cellContainer.x = x;
		cellContainer.y = y;
		cellContainer.rotation = (rotation * Math.PI) / 180;
		cellContainer.scale.x = magnification * (mirror ? -1 : 1);
		cellContainer.scale.y = magnification;

		// Batch polygons by layer for efficient rendering
		const layerGraphics = new Map<string, Graphics>();
		const layerBounds = new Map<string, BoundingBox>();

		let renderedPolygons = 0;
		for (const polygon of cell.polygons) {
			const layerKey = `${polygon.layer}:${polygon.datatype}`;
			const layer = document.layers.get(layerKey);
			if (!layer || !layer.visible) continue;

			// Get or create Graphics object for this layer
			let graphics = layerGraphics.get(layerKey);
			if (!graphics) {
				graphics = new Graphics();
				layerGraphics.set(layerKey, graphics);
				cellContainer.addChild(graphics);

				// Initialize bounds for this layer
				layerBounds.set(layerKey, {
					minX: Number.POSITIVE_INFINITY,
					minY: Number.POSITIVE_INFINITY,
					maxX: Number.NEGATIVE_INFINITY,
					maxY: Number.NEGATIVE_INFINITY,
				});
			}

			// Add polygon to batched graphics
			this.addPolygonToGraphics(graphics, polygon, layer.color);
			renderedPolygons++;

			// Update layer bounds (avoid calling getBounds() which is expensive)
			// biome-ignore lint/style/noNonNullAssertion: Bounds initialized earlier in loop
			const bounds = layerBounds.get(layerKey)!;
			bounds.minX = Math.min(bounds.minX, polygon.boundingBox.minX);
			bounds.minY = Math.min(bounds.minY, polygon.boundingBox.minY);
			bounds.maxX = Math.max(bounds.maxX, polygon.boundingBox.maxX);
			bounds.maxY = Math.max(bounds.maxY, polygon.boundingBox.maxY);
		}

		// Add Graphics objects to spatial index (one per layer)
		// DON'T call graphics.getBounds() - it's too expensive for large files
		for (const [layerKey, graphics] of layerGraphics) {
			// biome-ignore lint/style/noNonNullAssertion: Bounds exist for all layers in map
			const bounds = layerBounds.get(layerKey)!;
			const item: RTreeItem = {
				minX: bounds.minX + x,
				minY: bounds.minY + y,
				maxX: bounds.maxX + x,
				maxY: bounds.maxY + y,
				id: `${cell.name}_${layerKey}_${x}_${y}`,
				type: "layer",
				data: graphics,
			};
			this.spatialIndex.insert(item);
			this.allGraphicsItems.push(item);
		}

		if (DEBUG && renderedPolygons > 0) {
			console.log(
				`[PixiRenderer] Rendered ${renderedPolygons} polygons in ${layerGraphics.size} layer batches for cell ${cell.name}`,
			);
		}

		// Render instances (recursive) only if we have depth budget
		let totalPolygons = renderedPolygons;
		let remainingBudget = polygonBudget - renderedPolygons;

		if (maxDepth > 0 && remainingBudget > 0) {
			for (const instance of cell.instances) {
				if (remainingBudget <= 0) break;

				const refCell = document.cells.get(instance.cellRef);
				if (refCell) {
					const rendered = this.renderCellGeometry(
						refCell,
						document,
						x + instance.x,
						y + instance.y,
						rotation + instance.rotation,
						mirror !== instance.mirror,
						magnification * instance.magnification,
						maxDepth - 1, // Decrease depth for child instances
						remainingBudget,
					);
					totalPolygons += rendered;
					remainingBudget -= rendered;
				}
			}
		}

		this.mainContainer.addChild(cellContainer);
		return totalPolygons;
	}

	/**
	 * Add a polygon to an existing Graphics object (for batched rendering)
	 */
	private addPolygonToGraphics(graphics: Graphics, polygon: Polygon, colorHex: string): void {
		// Convert hex color to number
		const color = Number.parseInt(colorHex.replace("#", ""), 16);

		// Draw polygon
		if (polygon.points.length > 0 && polygon.points[0]) {
			graphics.moveTo(polygon.points[0].x, polygon.points[0].y);
			for (let i = 1; i < polygon.points.length; i++) {
				const point = polygon.points[i];
				if (point) {
					graphics.lineTo(point.x, point.y);
				}
			}
			graphics.closePath();
			graphics.fill({ color, alpha: 0.7 });
			graphics.stroke({ color, width: 0.5, alpha: 0.9 });
		}
	}

	/**
	 * Render test geometry (for prototyping)
	 */
	renderTestGeometry(count: number): void {
		this.clear();

		const colors = [0xff0000, 0x00ff00, 0x0000ff, 0xffff00, 0xff00ff, 0x00ffff];

		for (let i = 0; i < count; i++) {
			const graphics = new Graphics();
			const color = colors[i % colors.length];

			// Random rectangle
			const x = Math.random() * 1000 - 500;
			const y = Math.random() * 1000 - 500;
			const width = Math.random() * 50 + 10;
			const height = Math.random() * 50 + 10;

			graphics.rect(x, y, width, height);
			graphics.fill(color);
			graphics.alpha = 0.7;

			this.mainContainer.addChild(graphics);

			// Add to spatial index
			this.spatialIndex.insert({
				minX: x,
				minY: y,
				maxX: x + width,
				maxY: y + height,
				id: `rect-${i}`,
				type: "polygon",
				data: graphics,
			});
		}

		this.fitToView();
	}

	/**
	 * Fit viewport to show all geometry
	 */
	fitToView(): void {
		if (!this.isInitialized || !this.app.screen) {
			console.warn("[PixiRenderer] Cannot fit to view - renderer not initialized");
			return;
		}

		const bounds = this.mainContainer.getBounds();

		if (bounds.width === 0 || bounds.height === 0) {
			return;
		}

		const scaleX = this.app.screen.width / bounds.width;
		const scaleY = this.app.screen.height / bounds.height;
		const scale = Math.min(scaleX, scaleY) * 0.9;

		// Preserve Y-axis flip
		this.mainContainer.scale.set(scale, -scale);
		this.mainContainer.x = (this.app.screen.width - bounds.width * scale) / 2 - bounds.x * scale;
		this.mainContainer.y = (this.app.screen.height - bounds.height * scale) / 2 - bounds.y * scale;

		this.updateViewport();
		this.updateGrid();
		this.updateScaleBar();
	}

	/**
	 * Clear all rendered geometry
	 */
	clear(): void {
		this.mainContainer.removeChildren();
		this.spatialIndex.clear();
		this.allGraphicsItems = [];
	}

	/**
	 * Check if renderer is initialized and ready to render
	 */
	isReady(): boolean {
		return this.isInitialized;
	}

	/**
	 * Get current viewport state
	 */
	getViewportState(): ViewportState {
		return {
			x: this.mainContainer.x,
			y: this.mainContainer.y,
			scale: this.mainContainer.scale.x,
		};
	}

	/**
	 * Set viewport state
	 */
	setViewportState(state: ViewportState): void {
		this.mainContainer.x = state.x;
		this.mainContainer.y = state.y;
		this.mainContainer.scale.set(state.scale, -state.scale);
		this.updateViewport();
	}

	/**
	 * Destroy the renderer
	 */
	destroy(): void {
		this.app.destroy(true, { children: true, texture: true });
	}

	/**
	 * Resize the renderer
	 */
	resize(width: number, height: number): void {
		this.app.renderer.resize(width, height);
		this.fpsText.x = width - 80;
	}
}
