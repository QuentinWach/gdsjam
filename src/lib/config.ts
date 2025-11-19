/**
 * Application configuration and constants
 * Loaded from environment variables (.env files)
 */

// Log environment variables for debugging
console.log("[config.ts] Environment variables:", {
	VITE_DEBUG: import.meta.env.VITE_DEBUG,
	DEV: import.meta.env.DEV,
	MODE: import.meta.env.MODE,
});

/**
 * Debug mode - enables verbose console logging
 * Controlled by VITE_DEBUG environment variable
 * Default: true in development, false in production
 */
export const DEBUG = import.meta.env.VITE_DEBUG === "true" || import.meta.env.DEV;

console.log("[config.ts] DEBUG mode:", DEBUG);

/**
 * Maximum number of polygons to render per frame (prevents OOM)
 * Controlled by VITE_MAX_POLYGONS_PER_RENDER environment variable
 * Default: 100,000
 */
export const MAX_POLYGONS_PER_RENDER = Number(
	import.meta.env.VITE_MAX_POLYGONS_PER_RENDER || 100_000,
);

/**
 * FPS counter update interval in milliseconds
 * Controlled by VITE_FPS_UPDATE_INTERVAL environment variable
 * Default: 500ms
 */
export const FPS_UPDATE_INTERVAL = Number(import.meta.env.VITE_FPS_UPDATE_INTERVAL || 500);
