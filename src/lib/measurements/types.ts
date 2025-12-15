/**
 * Measurement Types - Data structures for measurement feature
 */

/**
 * Measurement point in world coordinates
 */
export interface MeasurementPoint {
	worldX: number;
	worldY: number;
}

/**
 * Two-point distance measurement
 */
export interface DistanceMeasurement {
	id: string;
	point1: MeasurementPoint;
	point2: MeasurementPoint;
	distanceMicrometers: number;
	createdAt: number;
}

/**
 * Active measurement state (being created)
 */
export interface ActiveMeasurement {
	point1: MeasurementPoint | null;
	point2: MeasurementPoint | null;
}

/**
 * Measurement store state
 */
export interface MeasurementStoreState {
	/** Measurement mode active */
	measurementModeActive: boolean;
	/** Current active measurement (being created) */
	activeMeasurement: ActiveMeasurement | null;
	/** Completed measurements */
	measurements: Map<string, DistanceMeasurement>;
	/** Measurements visible */
	measurementsVisible: boolean;
	/** File identifier for localStorage (fileName_fileSize) */
	fileIdentifier: string | null;
	/** Highlighted measurement ID (visual feedback only) */
	highlightedMeasurementId: string | null;
	/** Toast notification message (null = no toast) */
	toastMessage: string | null;
	/** Mode toast message for entering/exiting measurement mode (null = no toast) */
	modeToastMessage: string | null;
}
