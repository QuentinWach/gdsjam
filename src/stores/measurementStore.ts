/**
 * Measurement Store - Manages measurement mode state and persistence
 *
 * Storage Strategy:
 * - Solo mode: localStorage with key `gdsjam_measurements_${fileName}_${fileSize}`
 * - Collaboration: Local-only (NOT synced via Y.js)
 *
 * Limits:
 * - Maximum 50 measurements
 * - Auto-delete oldest when limit exceeded
 * - Toast warning when limit reached
 */

import { get, writable } from "svelte/store";
import { DEBUG_MEASUREMENT } from "../lib/debug";
import type {
	ActiveMeasurement,
	DistanceMeasurement,
	MeasurementPoint,
	MeasurementStoreState,
} from "../lib/measurements/types";
import { calculateDistance } from "../lib/measurements/utils";
import { generateUUID } from "../lib/utils/uuid";

const STORAGE_KEY_PREFIX = "gdsjam_measurements_";
const MAX_MEASUREMENTS = 50;
const TOAST_DURATION_MS = 3000; // 3 seconds
const MODE_TOAST_DURATION_MS = 2000; // 2 seconds (same as follow toast)

let toastTimeout: ReturnType<typeof setTimeout> | null = null;
let modeToastTimeout: ReturnType<typeof setTimeout> | null = null;

/**
 * Create the measurement store
 */
function createMeasurementStore() {
	const initialState: MeasurementStoreState = {
		measurementModeActive: false,
		activeMeasurement: null,
		measurements: new Map(),
		measurementsVisible: true,
		fileIdentifier: null,
		highlightedMeasurementId: null,
		toastMessage: null,
		modeToastMessage: null,
	};

	const { subscribe, set, update } = writable<MeasurementStoreState>(initialState);

	return {
		subscribe,

		/**
		 * Initialize for a new file
		 * Only reinitializes if fileIdentifier has changed (different file)
		 */
		initializeForFile: (fileName: string, fileSize: number) => {
			const fileIdentifier = `${fileName}_${fileSize}`;

			update((state) => {
				// Skip if already initialized for this file
				if (state.fileIdentifier === fileIdentifier) {
					return state;
				}

				return {
					...state,
					fileIdentifier,
					measurements: new Map(),
					measurementModeActive: false,
					activeMeasurement: null,
					highlightedMeasurementId: null,
					measurementsVisible: true,
				};
			});

			// Load from localStorage (solo mode)
			const currentState = get({ subscribe });
			if (currentState.fileIdentifier === fileIdentifier) {
				measurementStore.loadFromLocalStorage(fileIdentifier);
			}
		},

		/**
		 * Toggle measurement mode (enter/exit)
		 */
		toggleMeasurementMode: () => {
			// Clear any existing mode toast timeout
			if (modeToastTimeout) {
				clearTimeout(modeToastTimeout);
			}

			update((state) => {
				const newModeActive = !state.measurementModeActive;
				const modeToastMessage = newModeActive
					? "Measurement mode active"
					: "Measurement mode exited";

				// Auto-hide mode toast after duration
				modeToastTimeout = setTimeout(() => {
					update((s) => ({
						...s,
						modeToastMessage: null,
					}));
					modeToastTimeout = null;
				}, MODE_TOAST_DURATION_MS);

				return {
					...state,
					measurementModeActive: newModeActive,
					activeMeasurement: newModeActive ? { point1: null, point2: null } : null,
					modeToastMessage,
				};
			});
		},

		/**
		 * Enter measurement mode
		 */
		enterMeasurementMode: () => {
			update((state) => ({
				...state,
				measurementModeActive: true,
				activeMeasurement: { point1: null, point2: null },
			}));
		},

		/**
		 * Exit measurement mode and clear active measurement
		 */
		exitMeasurementMode: () => {
			update((state) => ({
				...state,
				measurementModeActive: false,
				activeMeasurement: null,
			}));
		},

		/**
		 * Add a point to the active measurement
		 * If point1 is null, sets point1. If point1 exists, sets point2 and completes measurement.
		 */
		addPoint: (
			worldX: number,
			worldY: number,
			documentUnits: { database: number; user: number },
		) => {
			update((state) => {
				if (!state.activeMeasurement) return state;

				const point: MeasurementPoint = { worldX, worldY };

				if (state.activeMeasurement.point1 === null) {
					// First point
					return {
						...state,
						activeMeasurement: {
							point1: point,
							point2: null,
						},
					};
				}

				// Second point - complete measurement
				const point1 = state.activeMeasurement.point1;
				const distanceMicrometers = calculateDistance(point1, point, documentUnits);

				const measurement: DistanceMeasurement = {
					id: generateUUID(),
					point1,
					point2: point,
					distanceMicrometers,
					createdAt: Date.now(),
				};

				const newMeasurements = new Map(state.measurements);

				// Check limit
				if (newMeasurements.size >= MAX_MEASUREMENTS) {
					// Find and delete oldest measurement
					let oldestId: string | null = null;
					let oldestTime = Number.POSITIVE_INFINITY;

					for (const [id, m] of newMeasurements) {
						if (m.createdAt < oldestTime) {
							oldestTime = m.createdAt;
							oldestId = id;
						}
					}

					if (oldestId) {
						newMeasurements.delete(oldestId);
					}
				}

				newMeasurements.set(measurement.id, measurement);

				const newState = {
					...state,
					measurements: newMeasurements,
					activeMeasurement: { point1: null, point2: null }, // Reset for next measurement
				};

				// Save to localStorage
				measurementStore.saveToLocalStorage(newState);

				// Show toast if at limit
				if (state.measurements.size >= MAX_MEASUREMENTS) {
					measurementStore.showToast(
						`Maximum ${MAX_MEASUREMENTS} measurements reached. Oldest measurement deleted.`,
					);
				}

				return newState;
			});
		},

		/**
		 * Set active measurement (for drag gesture on mobile)
		 */
		setActiveMeasurement: (activeMeasurement: ActiveMeasurement) => {
			update((state) => ({
				...state,
				activeMeasurement,
			}));
		},

		/**
		 * Complete active measurement (for drag gesture on mobile)
		 */
		completeActiveMeasurement: (documentUnits: { database: number; user: number }) => {
			update((state) => {
				if (!state.activeMeasurement?.point1 || !state.activeMeasurement?.point2) {
					return state;
				}

				const { point1, point2 } = state.activeMeasurement;
				const distanceMicrometers = calculateDistance(point1, point2, documentUnits);

				const measurement: DistanceMeasurement = {
					id: generateUUID(),
					point1,
					point2,
					distanceMicrometers,
					createdAt: Date.now(),
				};

				const newMeasurements = new Map(state.measurements);

				// Check limit
				if (newMeasurements.size >= MAX_MEASUREMENTS) {
					// Find and delete oldest measurement
					let oldestId: string | null = null;
					let oldestTime = Number.POSITIVE_INFINITY;

					for (const [id, m] of newMeasurements) {
						if (m.createdAt < oldestTime) {
							oldestTime = m.createdAt;
							oldestId = id;
						}
					}

					if (oldestId) {
						newMeasurements.delete(oldestId);
					}
				}

				newMeasurements.set(measurement.id, measurement);

				const newState = {
					...state,
					measurements: newMeasurements,
					activeMeasurement: { point1: null, point2: null }, // Reset for next measurement
				};

				// Save to localStorage
				measurementStore.saveToLocalStorage(newState);

				// Show toast if at limit
				if (state.measurements.size >= MAX_MEASUREMENTS) {
					measurementStore.showToast(
						`Maximum ${MAX_MEASUREMENTS} measurements reached. Oldest measurement deleted.`,
					);
				}

				return newState;
			});
		},

		/**
		 * Clear all measurements
		 */
		clearAllMeasurements: () => {
			update((state) => {
				const newState = {
					...state,
					measurements: new Map(),
					activeMeasurement: state.measurementModeActive ? { point1: null, point2: null } : null,
					highlightedMeasurementId: null,
				};

				// Save to localStorage
				measurementStore.saveToLocalStorage(newState);

				return newState;
			});
		},

		/**
		 * Highlight a measurement (visual feedback only)
		 */
		highlightMeasurement: (id: string | null) => {
			update((state) => ({
				...state,
				highlightedMeasurementId: id,
			}));
		},

		/**
		 * Toggle measurements visibility
		 */
		toggleMeasurementsVisibility: () => {
			update((state) => ({
				...state,
				measurementsVisible: !state.measurementsVisible,
			}));
		},

		/**
		 * Load measurements from localStorage
		 */
		loadFromLocalStorage: (fileIdentifier: string) => {
			try {
				const key = `${STORAGE_KEY_PREFIX}${fileIdentifier}`;
				const stored = localStorage.getItem(key);

				if (!stored) return;

				const parsed = JSON.parse(stored);

				if (!Array.isArray(parsed)) return;

				const measurements = new Map<string, DistanceMeasurement>();
				for (const m of parsed) {
					if (m.id && m.point1 && m.point2 && typeof m.distanceMicrometers === "number") {
						measurements.set(m.id, m as DistanceMeasurement);
					}
				}

				update((state) => ({
					...state,
					measurements,
				}));
			} catch (error) {
				if (DEBUG_MEASUREMENT) {
					console.error("[measurementStore] Failed to load from localStorage:", error);
				}
			}
		},

		/**
		 * Save measurements to localStorage
		 */
		saveToLocalStorage: (state: MeasurementStoreState) => {
			try {
				if (!state.fileIdentifier) return;

				const key = `${STORAGE_KEY_PREFIX}${state.fileIdentifier}`;
				const measurements = Array.from(state.measurements.values());
				localStorage.setItem(key, JSON.stringify(measurements));
			} catch (error) {
				if (DEBUG_MEASUREMENT) {
					console.error("[measurementStore] Failed to save to localStorage:", error);
				}
			}
		},

		/**
		 * Show toast notification
		 */
		showToast: (message: string) => {
			if (toastTimeout) {
				clearTimeout(toastTimeout);
			}

			update((state) => ({
				...state,
				toastMessage: message,
			}));

			toastTimeout = setTimeout(() => {
				update((state) => ({
					...state,
					toastMessage: null,
				}));
				toastTimeout = null;
			}, TOAST_DURATION_MS);
		},

		/**
		 * Hide toast notification
		 */
		hideToast: () => {
			if (toastTimeout) {
				clearTimeout(toastTimeout);
				toastTimeout = null;
			}
			update((state) => ({
				...state,
				toastMessage: null,
			}));
		},

		/**
		 * Hide mode toast notification
		 */
		hideModeToast: () => {
			if (modeToastTimeout) {
				clearTimeout(modeToastTimeout);
				modeToastTimeout = null;
			}
			update((state) => ({
				...state,
				modeToastMessage: null,
			}));
		},

		/**
		 * Reset store (called when file changes)
		 */
		reset: () => {
			if (toastTimeout) {
				clearTimeout(toastTimeout);
				toastTimeout = null;
			}
			set(initialState);
		},
	};
}

export const measurementStore = createMeasurementStore();
