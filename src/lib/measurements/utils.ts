/**
 * Measurement Utilities - Distance calculation and formatting
 */

import type { MeasurementPoint } from "./types";

/**
 * Calculate Euclidean distance between two points in micrometers
 *
 * @param point1 - First point in world coordinates (database units)
 * @param point2 - Second point in world coordinates (database units)
 * @param documentUnits - Document units (database unit in meters)
 * @returns Distance in micrometers
 */
export function calculateDistance(
	point1: MeasurementPoint,
	point2: MeasurementPoint,
	documentUnits: { database: number; user: number },
): number {
	// Calculate distance in database units
	const dx = point2.worldX - point1.worldX;
	const dy = point2.worldY - point1.worldY;
	const distanceDB = Math.sqrt(dx * dx + dy * dy);

	// Convert to micrometers
	// database unit is in meters, so: (db_units * database_meters) / 1e-6 = micrometers
	return (distanceDB * documentUnits.database) / 1e-6;
}

/**
 * Format distance with smart unit selection (nm/µm/mm)
 * Pattern from ScaleBarOverlay.ts
 *
 * @param micrometers - Distance in micrometers
 * @returns Formatted string with appropriate unit
 */
export function formatDistance(micrometers: number): string {
	if (micrometers < 1) {
		// Use nanometers for sub-micrometer distances
		const nanometers = micrometers * 1000;
		return `${nanometers.toFixed(2)} nm`;
	}

	if (micrometers < 1000) {
		// Use micrometers
		return `${micrometers.toFixed(3)} µm`;
	}

	// Use millimeters for large distances
	const millimeters = micrometers / 1000;
	return `${millimeters.toFixed(3)} mm`;
}

/**
 * Convert screen coordinates to world coordinates
 * Pattern from CoordinatesDisplay.ts and ViewerCanvas.svelte
 *
 * @param screenX - Screen X coordinate (pixels)
 * @param screenY - Screen Y coordinate (pixels)
 * @param containerX - Container X offset
 * @param containerY - Container Y offset
 * @param scale - Viewport scale
 * @returns World coordinates (database units)
 */
export function screenToWorld(
	screenX: number,
	screenY: number,
	containerX: number,
	containerY: number,
	scale: number,
): MeasurementPoint {
	const worldX = (screenX - containerX) / scale;
	// Y-axis is flipped (mainContainer.scale.y = -1), so negate Y coordinate
	const worldY = -((screenY - containerY) / scale);

	return { worldX, worldY };
}

/**
 * Convert world coordinates to screen coordinates
 * Used for rendering measurements
 *
 * @param worldX - World X coordinate (database units)
 * @param worldY - World Y coordinate (database units)
 * @param containerX - Container X offset
 * @param containerY - Container Y offset
 * @param scale - Viewport scale
 * @returns Screen coordinates (pixels)
 */
export function worldToScreen(
	worldX: number,
	worldY: number,
	containerX: number,
	containerY: number,
	scale: number,
): { x: number; y: number } {
	const screenX = worldX * scale + containerX;
	// Y-axis is flipped (mainContainer.scale.y = -1), so negate worldY
	const screenY = -worldY * scale + containerY;

	return { x: screenX, y: screenY };
}
