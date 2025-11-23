/**
 * GDS Loader - Shared utility for loading GDSII files from various sources
 */

import { gdsStore } from "../../stores/gdsStore";
import { DEBUG } from "../config";
import { convertDxfToGds } from "../converters/DxfToGdsConverter";
import { parseGDSII } from "../gds/GDSParser";

/**
 * Load a GDSII file from an ArrayBuffer
 * This is the shared loading logic used by both file upload and URL loading
 *
 * @param arrayBuffer - The file data as ArrayBuffer
 * @param fileName - The name of the file
 */
/**
 * Detect if file is DXF by content
 */
function isDxfFile(arrayBuffer: ArrayBuffer): boolean {
	try {
		const decoder = new TextDecoder("utf-8");
		const header = decoder.decode(
			new Uint8Array(arrayBuffer.slice(0, Math.min(200, arrayBuffer.byteLength))),
		);
		return header.includes("SECTION") && (header.includes("HEADER") || header.includes("ENTITIES"));
	} catch {
		return false;
	}
}

export async function loadGDSIIFromBuffer(
	arrayBuffer: ArrayBuffer,
	fileName: string,
): Promise<void> {
	const fileSizeMB = (arrayBuffer.byteLength / 1024 / 1024).toFixed(1);
	if (DEBUG) {
		console.log(`[gdsLoader] Loading ${fileName} (${fileSizeMB} MB)`);
	}

	const lowerFileName = fileName.toLowerCase();
	const isDxfByExtension = lowerFileName.endsWith(".dxf");
	const isDxfByContent = isDxfFile(arrayBuffer);
	const isDxf = isDxfByExtension || isDxfByContent;
	const isGds = lowerFileName.endsWith(".gds") || lowerFileName.endsWith(".gdsii");

	// Validate file extension
	if (!isGds && !isDxf) {
		gdsStore.setError("Please select a valid GDSII file (.gds, .gdsii) or DXF file (.dxf)");
		return;
	}

	try {
		if (isDxf) {
			if (DEBUG && isDxfByContent && !isDxfByExtension) {
				console.log("[gdsLoader] Detected DXF file by content (not extension)");
			}
			// Convert DXF to GDSII
			gdsStore.setLoading(true, "Converting DXF to GDSII...", 5);

			const document = await convertDxfToGds(
				new Uint8Array(arrayBuffer),
				fileName,
				(progress, message) => {
					gdsStore.updateProgress(progress, message);
				},
			);

			// Create statistics for DXF conversion
			const layerStats = new Map<
				string,
				{
					layer: number;
					datatype: number;
					polygonCount: number;
				}
			>();

			// Count polygons per layer
			for (const cell of document.cells.values()) {
				for (const polygon of cell.polygons) {
					const key = `${polygon.layer}:${polygon.datatype}`;
					const existing = layerStats.get(key);
					if (existing) {
						existing.polygonCount++;
					} else {
						layerStats.set(key, {
							layer: polygon.layer,
							datatype: polygon.datatype,
							polygonCount: 1,
						});
					}
				}
			}

			const statistics = {
				fileName,
				fileSizeBytes: arrayBuffer.byteLength,
				parseTimeMs: 0,
				totalCells: document.cells.size,
				topCellCount: document.topCells.length,
				topCellNames: document.topCells,
				totalPolygons: Array.from(document.cells.values()).reduce(
					(sum, cell) => sum + cell.polygons.length,
					0,
				),
				totalInstances: 0,
				layerStats,
				boundingBox: document.boundingBox,
				layoutWidth: (document.boundingBox.maxX - document.boundingBox.minX) * 1e6, // Convert to micrometers
				layoutHeight: (document.boundingBox.maxY - document.boundingBox.minY) * 1e6,
			};

			gdsStore.setDocument(document, fileName, statistics);
			if (DEBUG) {
				console.log("[gdsLoader] DXF file converted and loaded successfully");
			}
		} else {
			// Parse GDSII file
			gdsStore.setLoading(true, "Parsing GDSII file...", 5);

			const { document, statistics } = await parseGDSII(
				arrayBuffer,
				fileName,
				(progress, message) => {
					gdsStore.updateProgress(progress, message);
				},
			);

			gdsStore.setDocument(document, fileName, statistics);
			if (DEBUG) {
				console.log("[gdsLoader] File loaded successfully");
			}
		}
	} catch (error) {
		console.error("[gdsLoader] Failed to load file:", error);
		gdsStore.setError(
			`Failed to load file: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}
