/**
 * URL Loader - Fetch GDSII files from remote URLs
 */

import { DEBUG } from "../config";

/**
 * Fetch a GDSII file from a URL
 * @param url - The URL to fetch the file from
 * @param onProgress - Optional progress callback
 * @returns ArrayBuffer containing the file data and the filename
 */
export async function fetchGDSIIFromURL(
	url: string,
	onProgress?: (progress: number, message: string) => void,
): Promise<{ arrayBuffer: ArrayBuffer; fileName: string }> {
	if (DEBUG) {
		console.log(`[urlLoader] Fetching GDSII from URL: ${url}`);
	}

	try {
		// Validate URL
		let parsedUrl: URL;
		try {
			parsedUrl = new URL(url);
		} catch {
			throw new Error("Invalid URL format");
		}

		// Extract filename from URL
		const pathParts = parsedUrl.pathname.split("/");
		let fileName = pathParts[pathParts.length - 1] || "remote.gds";

		// Ensure filename has .gds or .gdsii extension
		if (!fileName.toLowerCase().endsWith(".gds") && !fileName.toLowerCase().endsWith(".gdsii")) {
			fileName = `${fileName}.gds`;
		}

		if (DEBUG) {
			console.log(`[urlLoader] Extracted filename: ${fileName}`);
		}

		onProgress?.(5, "Fetching file from URL...");

		// Fetch the file
		const response = await fetch(url, {
			method: "GET",
			mode: "cors", // Enable CORS
			cache: "default",
		});

		if (!response.ok) {
			throw new Error(`HTTP error! status: ${response.status} ${response.statusText}`);
		}

		// Check content type (optional, some servers may not set it correctly)
		const contentType = response.headers.get("content-type");
		if (DEBUG && contentType) {
			console.log(`[urlLoader] Content-Type: ${contentType}`);
		}

		// Get content length for progress tracking
		const contentLength = response.headers.get("content-length");
		const totalBytes = contentLength ? Number.parseInt(contentLength, 10) : 0;

		if (DEBUG) {
			console.log(
				`[urlLoader] Content-Length: ${totalBytes} bytes (${(totalBytes / 1024 / 1024).toFixed(1)} MB)`,
			);
		}

		// Read the response body with progress tracking
		const reader = response.body?.getReader();
		if (!reader) {
			throw new Error("Failed to get response reader");
		}

		const chunks: Uint8Array[] = [];
		let receivedBytes = 0;

		while (true) {
			const { done, value } = await reader.read();

			if (done) {
				break;
			}

			chunks.push(value);
			receivedBytes += value.length;

			// Update progress (5% to 95% range for download)
			if (totalBytes > 0) {
				const downloadProgress = 5 + Math.floor((receivedBytes / totalBytes) * 90);
				onProgress?.(
					downloadProgress,
					`Downloading... ${(receivedBytes / 1024 / 1024).toFixed(1)} MB`,
				);
			} else {
				onProgress?.(50, `Downloading... ${(receivedBytes / 1024 / 1024).toFixed(1)} MB`);
			}
		}

		onProgress?.(95, "Download complete, preparing file...");

		// Combine chunks into a single ArrayBuffer
		const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
		const combinedArray = new Uint8Array(totalLength);
		let offset = 0;
		for (const chunk of chunks) {
			combinedArray.set(chunk, offset);
			offset += chunk.length;
		}

		if (DEBUG) {
			console.log(`[urlLoader] Downloaded ${totalLength} bytes`);
		}

		onProgress?.(100, "File ready");

		return {
			arrayBuffer: combinedArray.buffer,
			fileName,
		};
	} catch (error) {
		console.error("[urlLoader] Failed to fetch file from URL:", error);

		// Provide more helpful error messages
		if (error instanceof TypeError && error.message.includes("Failed to fetch")) {
			throw new Error(
				"Failed to fetch file. This may be due to CORS restrictions or network issues. Make sure the URL is accessible and allows cross-origin requests.",
			);
		}

		throw error instanceof Error ? error : new Error(`Failed to load from URL: ${String(error)}`);
	}
}
