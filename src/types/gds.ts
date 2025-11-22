/**
 * GDSII Type Definitions
 * Coordinate system: Micrometers (µm)
 */

export interface Point {
	x: number;
	y: number;
}

export interface BoundingBox {
	minX: number;
	minY: number;
	maxX: number;
	maxY: number;
}

export interface Polygon {
	id: string;
	layer: number;
	datatype: number;
	points: Point[];
	boundingBox: BoundingBox;
}

export interface CellInstance {
	id: string;
	cellRef: string; // Reference to cell name
	x: number;
	y: number;
	rotation: number; // Degrees
	mirror: boolean; // Mirror across X-axis
	magnification: number;
	arrayRows?: number;
	arrayCols?: number;
	arraySpacingX?: number;
	arraySpacingY?: number;
	boundingBox: BoundingBox;
}

export interface Cell {
	name: string;
	polygons: Polygon[];
	instances: CellInstance[];
	boundingBox: BoundingBox;
}

export interface Layer {
	layer: number;
	datatype: number;
	name?: string;
	color: string; // Hex color
	visible: boolean;
}

export interface GDSDocument {
	name: string;
	cells: Map<string, Cell>;
	layers: Map<string, Layer>; // Key: "layer:datatype"
	topCells: string[]; // Names of top-level cells
	boundingBox: BoundingBox;
	units: {
		database: number; // Database units per user unit
		user: number; // User units in meters
	};
}

export interface FileStatistics {
	fileName: string;
	fileSizeBytes: number;
	parseTimeMs: number;
	totalCells: number;
	topCellCount: number;
	topCellNames: string[];
	totalPolygons: number;
	totalInstances: number;
	layerStats: Map<
		string,
		{
			layer: number;
			datatype: number;
			polygonCount: number;
		}
	>;
	boundingBox: BoundingBox;
	layoutWidth: number; // in micrometers
	layoutHeight: number; // in micrometers
}
