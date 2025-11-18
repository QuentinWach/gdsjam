/**
 * R-tree Spatial Index for efficient viewport culling and hit-testing
 * Uses rbush library for high-performance spatial queries
 */

import RBush from "rbush";
import type { BoundingBox } from "../../types/gds";

export interface RTreeItem {
	minX: number;
	minY: number;
	maxX: number;
	maxY: number;
	id: string;
	type: "polygon" | "instance";
	data: unknown; // Reference to actual polygon or instance
}

export class SpatialIndex {
	private tree: RBush<RTreeItem>;

	constructor() {
		this.tree = new RBush<RTreeItem>();
	}

	/**
	 * Insert an item into the spatial index
	 */
	insert(item: RTreeItem): void {
		this.tree.insert(item);
	}

	/**
	 * Insert multiple items at once (more efficient than individual inserts)
	 */
	insertBulk(items: RTreeItem[]): void {
		this.tree.load(items);
	}

	/**
	 * Query items within a bounding box (viewport culling)
	 */
	query(bbox: BoundingBox): RTreeItem[] {
		return this.tree.search({
			minX: bbox.minX,
			minY: bbox.minY,
			maxX: bbox.maxX,
			maxY: bbox.maxY,
		});
	}

	/**
	 * Find items at a specific point (hit-testing)
	 */
	queryPoint(x: number, y: number, tolerance = 0.1): RTreeItem[] {
		return this.tree.search({
			minX: x - tolerance,
			minY: y - tolerance,
			maxX: x + tolerance,
			maxY: y + tolerance,
		});
	}

	/**
	 * Clear all items from the index
	 */
	clear(): void {
		this.tree.clear();
	}

	/**
	 * Remove a specific item
	 */
	remove(item: RTreeItem): void {
		this.tree.remove(item);
	}

	/**
	 * Get total number of items in the index
	 */
	size(): number {
		return this.tree.toJSON().children?.length ?? 0;
	}
}
