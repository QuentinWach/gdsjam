/**
 * GDS Loader - Shared utility for loading GDSII files from various sources
 */

import { gdsStore } from "../../stores/gdsStore";
import { DEBUG } from "../config";
import { parseGDSII } from "../gds/GDSParser";

/**
 * Load a GDSII file from an ArrayBuffer
 * This is the shared loading logic used by both file upload and URL loading
 *
 * @param arrayBuffer - The file data as ArrayBuffer
 * @param fileName - The name of the file
 */
export async function loadGDSIIFromBuffer(
	arrayBuffer: ArrayBuffer,
	fileName: string,
): Promise<void> {
	const fileSizeMB = (arrayBuffer.byteLength / 1024 / 1024).toFixed(1);
	if (DEBUG) {
		console.log(`[gdsLoader] Loading ${fileName} (${fileSizeMB} MB)`);
	}

	// Validate file extension
	if (!fileName.toLowerCase().endsWith(".gds") && !fileName.toLowerCase().endsWith(".gdsii")) {
		gdsStore.setError("Please select a valid GDSII file (.gds or .gdsii)");
		return;
	}

	try {
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
	} catch (error) {
		console.error("[gdsLoader] Failed to load GDSII file:", error);
		gdsStore.setError(
			`Failed to load file: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}
