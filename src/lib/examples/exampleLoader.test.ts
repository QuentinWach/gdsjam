/**
 * Tests for the example loader module
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	DecompressionError,
	ExampleLoadError,
	FetchError,
	loadExample,
	ValidationError,
} from "./exampleLoader";
import type { Example } from "./types";

// Mock the gdsLoader module
vi.mock("../utils/gdsLoader", () => ({
	loadGDSIIFromBuffer: vi.fn().mockResolvedValue(undefined),
}));

// Sample example for testing
const mockExample: Example = {
	id: "test-example",
	name: "Test Example",
	description: "A test example",
	category: "demo",
	source: "other",
	attribution: "Test",
	sourceUrl: "https://example.com",
	license: "MIT",
	url: "https://example.com/test.gds",
	fileSizeMB: 0.1,
	isCompressed: false,
};

const mockCompressedExample: Example = {
	...mockExample,
	id: "test-compressed",
	name: "Test Compressed",
	url: "https://example.com/test.gds.gz",
	isCompressed: true,
};

describe("loadExample", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("should load an uncompressed GDS file successfully", async () => {
		const mockData = new Uint8Array([1, 2, 3, 4, 5]);
		const mockResponse = {
			ok: true,
			headers: new Headers({
				"content-type": "application/octet-stream",
				"content-length": String(mockData.length),
			}),
			body: new ReadableStream({
				start(controller) {
					controller.enqueue(mockData);
					controller.close();
				},
			}),
		};

		global.fetch = vi.fn().mockResolvedValue(mockResponse);

		const result = await loadExample(mockExample);

		expect(result.fileName).toBe("Test_Example.gds");
		expect(result.arrayBuffer.byteLength).toBe(5);
		expect(fetch).toHaveBeenCalledWith(mockExample.url, {
			method: "GET",
			mode: "cors",
			cache: "default",
		});
	});

	it("should track download progress", async () => {
		const mockData = new Uint8Array([1, 2, 3, 4, 5]);
		const mockResponse = {
			ok: true,
			headers: new Headers({
				"content-type": "application/octet-stream",
				"content-length": String(mockData.length),
			}),
			body: new ReadableStream({
				start(controller) {
					controller.enqueue(mockData);
					controller.close();
				},
			}),
		};

		global.fetch = vi.fn().mockResolvedValue(mockResponse);

		const progressCalls: Array<{ progress: number; message: string }> = [];
		await loadExample(mockExample, (progress, message) => {
			progressCalls.push({ progress, message });
		});

		expect(progressCalls.length).toBeGreaterThan(0);
		expect(progressCalls[0]?.progress).toBe(5); // START progress
	});

	it("should throw FetchError on HTTP error", async () => {
		const mockResponse = {
			ok: false,
			status: 404,
			statusText: "Not Found",
		};

		global.fetch = vi.fn().mockResolvedValue(mockResponse);

		await expect(loadExample(mockExample)).rejects.toThrow(FetchError);
		await expect(loadExample(mockExample)).rejects.toThrow("404");
	});

	it("should throw FetchError when response body is null", async () => {
		const mockResponse = {
			ok: true,
			headers: new Headers(),
			body: null,
		};

		global.fetch = vi.fn().mockResolvedValue(mockResponse);

		await expect(loadExample(mockExample)).rejects.toThrow(FetchError);
		await expect(loadExample(mockExample)).rejects.toThrow("Failed to get response reader");
	});

	it("should throw ValidationError for HTML content type", async () => {
		const mockResponse = {
			ok: true,
			headers: new Headers({
				"content-type": "text/html; charset=utf-8",
			}),
			body: new ReadableStream({
				start(controller) {
					controller.enqueue(new Uint8Array([1]));
					controller.close();
				},
			}),
		};

		global.fetch = vi.fn().mockResolvedValue(mockResponse);

		await expect(loadExample(mockExample)).rejects.toThrow(ValidationError);
		await expect(loadExample(mockExample)).rejects.toThrow("HTML");
	});

	it("should throw ValidationError for oversized files", async () => {
		const mockResponse = {
			ok: true,
			headers: new Headers({
				"content-type": "application/octet-stream",
				"content-length": String(60 * 1024 * 1024), // 60 MB > 50 MB limit
			}),
			body: new ReadableStream({
				start(controller) {
					controller.enqueue(new Uint8Array([1]));
					controller.close();
				},
			}),
		};

		global.fetch = vi.fn().mockResolvedValue(mockResponse);

		await expect(loadExample(mockExample)).rejects.toThrow(ValidationError);
		await expect(loadExample(mockExample)).rejects.toThrow("too large");
	});

	it("should throw FetchError for network failures", async () => {
		global.fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));

		await expect(loadExample(mockExample)).rejects.toThrow(FetchError);
		await expect(loadExample(mockExample)).rejects.toThrow("CORS");
	});

	it("should add .gds extension if missing", async () => {
		const exampleWithoutExt: Example = {
			...mockExample,
			name: "NoExtension",
		};

		const mockData = new Uint8Array([1, 2, 3]);
		const mockResponse = {
			ok: true,
			headers: new Headers(),
			body: new ReadableStream({
				start(controller) {
					controller.enqueue(mockData);
					controller.close();
				},
			}),
		};

		global.fetch = vi.fn().mockResolvedValue(mockResponse);

		const result = await loadExample(exampleWithoutExt);
		expect(result.fileName).toBe("NoExtension.gds");
	});

	it("should replace spaces with underscores in filename", async () => {
		const exampleWithSpaces: Example = {
			...mockExample,
			name: "My Test File",
		};

		const mockData = new Uint8Array([1, 2, 3]);
		const mockResponse = {
			ok: true,
			headers: new Headers(),
			body: new ReadableStream({
				start(controller) {
					controller.enqueue(mockData);
					controller.close();
				},
			}),
		};

		global.fetch = vi.fn().mockResolvedValue(mockResponse);

		const result = await loadExample(exampleWithSpaces);
		expect(result.fileName).toBe("My_Test_File.gds");
	});
});

describe("Error classes", () => {
	it("should have correct error hierarchy", () => {
		const exampleError = new ExampleLoadError("test");
		const fetchError = new FetchError("test");
		const validationError = new ValidationError("test");
		const decompressionError = new DecompressionError("test");

		expect(exampleError).toBeInstanceOf(Error);
		expect(fetchError).toBeInstanceOf(ExampleLoadError);
		expect(validationError).toBeInstanceOf(ExampleLoadError);
		expect(decompressionError).toBeInstanceOf(ExampleLoadError);
	});

	it("should have correct error names", () => {
		expect(new ExampleLoadError("test").name).toBe("ExampleLoadError");
		expect(new FetchError("test").name).toBe("FetchError");
		expect(new ValidationError("test").name).toBe("ValidationError");
		expect(new DecompressionError("test").name).toBe("DecompressionError");
	});
});
