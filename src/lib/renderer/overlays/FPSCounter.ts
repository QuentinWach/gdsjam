/**
 * FPSCounter - Tracks and displays frames per second and memory usage
 *
 * Responsibilities:
 * - Count frames rendered per second
 * - Track memory usage (when available)
 * - Update FPS and memory display at configurable interval
 * - Provide current FPS value for performance metrics
 *
 * Implementation:
 * - Called on every render tick via onTick()
 * - Updates display text only when update interval elapses
 * - Calculates FPS as: (frame count * 1000) / elapsed time
 * - Memory usage only shown on Chromium-based browsers (Chrome, Edge, Opera)
 */

import type { Text } from "pixi.js";

// Type definition for performance.memory (non-standard, Chromium only)
interface PerformanceMemory {
	usedJSHeapSize: number;
	totalJSHeapSize: number;
	jsHeapSizeLimit: number;
}

interface PerformanceWithMemory extends Performance {
	memory?: PerformanceMemory;
}

export class FPSCounter {
	private fpsText: Text;
	private memoryText: Text | null = null;
	private lastFrameTime: number;
	private frameCount: number;
	private updateInterval: number;
	private currentFPS = 0;
	private memorySupported: boolean;

	constructor(fpsText: Text, memoryText: Text | null, updateInterval: number) {
		this.fpsText = fpsText;
		this.memoryText = memoryText;
		this.updateInterval = updateInterval;
		this.lastFrameTime = performance.now();
		this.frameCount = 0;

		// Check if performance.memory is available (Chromium only)
		this.memorySupported = !!(performance as PerformanceWithMemory).memory;

		// Hide memory text if not supported
		if (this.memoryText && !this.memorySupported) {
			this.memoryText.visible = false;
		}
	}

	/**
	 * Called on every render tick
	 */
	onTick(): void {
		this.frameCount++;
		const now = performance.now();
		const elapsed = now - this.lastFrameTime;

		if (elapsed >= this.updateInterval) {
			const fps = Math.round((this.frameCount * 1000) / elapsed);
			this.currentFPS = fps;
			this.fpsText.text = `FPS: ${fps}`;

			// Update memory usage if supported
			if (this.memorySupported && this.memoryText) {
				const memoryInfo = (performance as PerformanceWithMemory).memory;
				if (memoryInfo) {
					const usedMB = Math.round(memoryInfo.usedJSHeapSize / (1024 * 1024));
					this.memoryText.text = `Mem: ${usedMB} MB`;
				}
			}

			this.frameCount = 0;
			this.lastFrameTime = now;
		}
	}

	/**
	 * Update text position (called on window resize)
	 * Both texts are right-aligned (anchor at 1, 0), so x position is the right edge minus padding
	 */
	updatePosition(screenWidth: number): void {
		this.fpsText.x = screenWidth - 10;
		if (this.memoryText && this.memorySupported) {
			this.memoryText.x = screenWidth - 10;
		}
	}

	/**
	 * Get current FPS value
	 */
	getCurrentFPS(): number {
		return this.currentFPS;
	}
}
