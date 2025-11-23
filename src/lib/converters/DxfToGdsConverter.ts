/**
 * DXF to GDSII Converter
 * Converts DXF (AutoCAD Drawing Exchange Format) files to GDSII format
 */

import type { IDxf, IEntity } from "dxf-parser";
import { DxfParser } from "dxf-parser";
import type { Cell, GDSDocument, Layer, Point, Polygon } from "../../types/gds";
import { DEBUG } from "../config";

/**
 * Generate UUID v4 compatible with Safari on iOS
 */
function generateUUID(): string {
	if (typeof crypto !== "undefined" && crypto.randomUUID) {
		return crypto.randomUUID();
	}
	return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
		const r = (Math.random() * 16) | 0;
		const v = c === "x" ? r : (r & 0x3) | 0x8;
		return v.toString(16);
	});
}

/**
 * Generate a color for a layer based on layer name/number
 * Returns hex color string (e.g., "#ff5733")
 */
function generateLayerColor(layerName: string): string {
	// Simple hash function to generate consistent colors
	let hash = 0;
	for (let i = 0; i < layerName.length; i++) {
		hash = layerName.charCodeAt(i) + ((hash << 5) - hash);
	}

	// Convert hash to RGB
	const r = (hash & 0xff0000) >> 16;
	const g = (hash & 0x00ff00) >> 8;
	const b = hash & 0x0000ff;

	// Ensure colors are vibrant (not too dark)
	const minBrightness = 100;
	const adjustedR = Math.max(r, minBrightness);
	const adjustedG = Math.max(g, minBrightness);
	const adjustedB = Math.max(b, minBrightness);

	return `#${adjustedR.toString(16).padStart(2, "0")}${adjustedG.toString(16).padStart(2, "0")}${adjustedB.toString(16).padStart(2, "0")}`;
}

/**
 * Convert DXF entity to GDSII polygon
 */
function convertEntityToPolygon(entity: IEntity, layerNumber: number): Polygon | null {
	const points: Point[] = [];

	switch (entity.type) {
		case "LINE": {
			const line = entity as any;
			if (line.vertices && line.vertices.length >= 2) {
				points.push({ x: line.vertices[0].x, y: line.vertices[0].y });
				points.push({ x: line.vertices[1].x, y: line.vertices[1].y });
				// Close the line by adding a small width (convert to rectangle)
				// This is a simplification - real conversion would need more sophisticated handling
			}
			break;
		}

		case "LWPOLYLINE":
		case "POLYLINE": {
			const poly = entity as any;
			if (poly.vertices && poly.vertices.length > 0) {
				for (const vertex of poly.vertices) {
					points.push({ x: vertex.x, y: vertex.y });
				}
			}
			break;
		}

		case "CIRCLE": {
			const circle = entity as any;
			// Approximate circle with polygon (32 sides)
			const segments = 32;
			const centerX = circle.center?.x || 0;
			const centerY = circle.center?.y || 0;
			const radius = circle.radius || 0;
			for (let i = 0; i < segments; i++) {
				const angle = (i / segments) * 2 * Math.PI;
				points.push({
					x: centerX + radius * Math.cos(angle),
					y: centerY + radius * Math.sin(angle),
				});
			}
			break;
		}

		case "ARC": {
			const arc = entity as any;
			// Approximate arc with polygon segments
			const segments = 16;
			const centerX = arc.center?.x || 0;
			const centerY = arc.center?.y || 0;
			const radius = arc.radius || 0;
			const startAngle = ((arc.startAngle || 0) * Math.PI) / 180;
			const endAngle = ((arc.endAngle || 0) * Math.PI) / 180;
			for (let i = 0; i <= segments; i++) {
				const angle = startAngle + (i / segments) * (endAngle - startAngle);
				points.push({
					x: centerX + radius * Math.cos(angle),
					y: centerY + radius * Math.sin(angle),
				});
			}
			break;
		}

		case "SOLID":
		case "3DFACE": {
			const solid = entity as any;
			if (solid.corners && solid.corners.length > 0) {
				for (const corner of solid.corners) {
					points.push({ x: corner.x, y: corner.y });
				}
			}
			break;
		}

		default:
			// Unsupported entity type
			return null;
	}

	if (points.length < 3) {
		return null; // Need at least 3 points for a polygon
	}

	// Close the polygon if not already closed
	const firstPoint = points[0];
	const lastPoint = points[points.length - 1];
	if (firstPoint && lastPoint && (firstPoint.x !== lastPoint.x || firstPoint.y !== lastPoint.y)) {
		points.push({ x: firstPoint.x, y: firstPoint.y });
	}

	// Calculate bounding box
	let minX = Number.POSITIVE_INFINITY;
	let minY = Number.POSITIVE_INFINITY;
	let maxX = Number.NEGATIVE_INFINITY;
	let maxY = Number.NEGATIVE_INFINITY;

	for (const point of points) {
		minX = Math.min(minX, point.x);
		minY = Math.min(minY, point.y);
		maxX = Math.max(maxX, point.x);
		maxY = Math.max(maxY, point.y);
	}

	return {
		id: generateUUID(),
		points,
		layer: layerNumber,
		datatype: 0,
		boundingBox: { minX, minY, maxX, maxY },
	};
}

/**
 * Convert DXF file to GDSII document
 */
export async function convertDxfToGds(
	fileData: Uint8Array,
	fileName: string,
	onProgress?: (progress: number, message: string) => void,
): Promise<GDSDocument> {
	onProgress?.(10, "Parsing DXF file...");

	// Convert Uint8Array to string
	const decoder = new TextDecoder("utf-8");
	const dxfText = decoder.decode(fileData);

	if (DEBUG) {
		console.log(`[DxfToGdsConverter] Parsing DXF file: ${fileName}`);
	}

	// Parse DXF
	const parser = new DxfParser();
	let dxf: IDxf;
	try {
		const parsed = parser.parseSync(dxfText);
		if (!parsed) {
			throw new Error("DXF parser returned null");
		}
		dxf = parsed;
	} catch (error) {
		throw new Error(
			`Failed to parse DXF file: ${error instanceof Error ? error.message : String(error)}`,
		);
	}

	onProgress?.(30, "Converting entities to GDSII...");

	if (DEBUG) {
		console.log("[DxfToGdsConverter] DXF parsed successfully:", {
			entities: dxf.entities?.length || 0,
			layers: Object.keys(dxf.tables?.layer?.layers || {}).length,
			blocks: Object.keys(dxf.blocks || {}).length,
		});
	}

	// Create layer map
	const layerMap = new Map<string, Layer>();
	const dxfLayers = dxf.tables?.layer?.layers || {};
	let layerNumber = 0;

	// Create layers from DXF layer table
	for (const [layerName] of Object.entries(dxfLayers)) {
		const layer: Layer = {
			layer: layerNumber,
			datatype: 0,
			name: layerName,
			color: generateLayerColor(layerName),
			visible: true,
		};
		layerMap.set(`${layerNumber}:0`, layer);
		layerNumber++;
	}

	// If no layers defined, create a default layer
	if (layerMap.size === 0) {
		const defaultLayer: Layer = {
			layer: 0,
			datatype: 0,
			name: "0",
			color: "#4a9eff",
			visible: true,
		};
		layerMap.set("0:0", defaultLayer);
	}

	onProgress?.(50, "Converting entities...");

	// Convert entities to polygons
	const polygons: Polygon[] = [];
	const entities = dxf.entities || [];
	const layerNameToNumber = new Map<string, number>();

	// Build layer name to number mapping
	let currentLayerNum = 0;
	for (const [layerName] of Object.entries(dxfLayers)) {
		layerNameToNumber.set(layerName, currentLayerNum++);
	}

	for (let i = 0; i < entities.length; i++) {
		const entity = entities[i];
		if (!entity) continue;

		const entityLayerName = (entity as any).layer || "0";
		let entityLayerNumber = layerNameToNumber.get(entityLayerName);

		// If layer not found, create it
		if (entityLayerNumber === undefined) {
			entityLayerNumber = layerNumber++;
			layerNameToNumber.set(entityLayerName, entityLayerNumber);

			const newLayer: Layer = {
				layer: entityLayerNumber,
				datatype: 0,
				name: entityLayerName,
				color: generateLayerColor(entityLayerName),
				visible: true,
			};
			layerMap.set(`${entityLayerNumber}:0`, newLayer);
		}

		const polygon = convertEntityToPolygon(entity, entityLayerNumber);
		if (polygon) {
			polygons.push(polygon);
		}

		if (i % 100 === 0) {
			onProgress?.(
				50 + (i / entities.length) * 40,
				`Converting entities (${i}/${entities.length})...`,
			);
		}
	}

	onProgress?.(90, "Creating GDSII document...");

	if (DEBUG) {
		console.log(
			`[DxfToGdsConverter] Converted ${polygons.length} polygons from ${entities.length} entities`,
		);
	}

	// Calculate bounding box for the entire document
	let minX = Number.POSITIVE_INFINITY;
	let minY = Number.POSITIVE_INFINITY;
	let maxX = Number.NEGATIVE_INFINITY;
	let maxY = Number.NEGATIVE_INFINITY;

	for (const polygon of polygons) {
		minX = Math.min(minX, polygon.boundingBox.minX);
		minY = Math.min(minY, polygon.boundingBox.minY);
		maxX = Math.max(maxX, polygon.boundingBox.maxX);
		maxY = Math.max(maxY, polygon.boundingBox.maxY);
	}

	// Create top cell
	const topCell: Cell = {
		name: fileName.replace(/\.(dxf|DXF)$/, ""),
		polygons,
		instances: [],
		boundingBox: { minX, minY, maxX, maxY },
	};

	// Create GDS document
	const document: GDSDocument = {
		name: fileName,
		units: {
			database: 1e-9, // 1 database unit = 1 nanometer
			user: 0.001, // 1 user unit = 1 millimeter
		},
		cells: new Map([[topCell.name, topCell]]),
		layers: layerMap,
		topCells: [topCell.name],
		boundingBox: topCell.boundingBox,
	};

	onProgress?.(100, "Conversion complete!");

	return document;
}
