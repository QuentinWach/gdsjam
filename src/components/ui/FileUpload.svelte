<script lang="ts">
import { parseGDSII } from "../../lib/gds/GDSParser";
// biome-ignore lint/correctness/noUnusedImports: Used in template
import { gdsStore } from "../../stores/gdsStore";

// Debug mode - set to false to reduce console logs
const DEBUG = false;

// biome-ignore lint/correctness/noUnusedVariables: Used in template
let isDragging = false;
// biome-ignore lint/correctness/noUnusedVariables: Used in template
let fileInputElement: HTMLInputElement;

/**
 * Handle file selection
 */
async function handleFile(file: File) {
	console.log(`[FileUpload] Loading ${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB)`);

	if (!file.name.toLowerCase().endsWith(".gds") && !file.name.toLowerCase().endsWith(".gdsii")) {
		console.warn("[FileUpload] Invalid file extension");
		gdsStore.setError("Please select a valid GDSII file (.gds or .gdsii)");
		return;
	}

	try {
		gdsStore.setLoading(true, "Reading file...", 0);

		// Read file
		const arrayBuffer = await file.arrayBuffer();
		if (DEBUG) {
			console.log(`[FileUpload] File read complete: ${arrayBuffer.byteLength} bytes`);
		}

		// Parse GDSII
		gdsStore.updateProgress(50, "Parsing GDSII file...");
		const document = await parseGDSII(arrayBuffer);

		// Update store
		gdsStore.updateProgress(100, "Complete!");
		gdsStore.setDocument(document, file.name);
		console.log("[FileUpload] File loaded successfully");
	} catch (error) {
		console.error("[FileUpload] Failed to load GDSII file:", error);
		gdsStore.setError(
			`Failed to load file: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

/**
 * Handle file input change
 */
// biome-ignore lint/correctness/noUnusedVariables: Used in template
function handleFileInput(event: Event) {
	const target = event.target as HTMLInputElement;
	const file = target.files?.[0];
	if (file) {
		handleFile(file);
	}
}

/**
 * Handle drag over
 */
// biome-ignore lint/correctness/noUnusedVariables: Used in template
function handleDragOver(event: DragEvent) {
	event.preventDefault();
	isDragging = true;
}

/**
 * Handle drag leave
 */
// biome-ignore lint/correctness/noUnusedVariables: Used in template
function handleDragLeave() {
	isDragging = false;
}

/**
 * Handle drop
 */
// biome-ignore lint/correctness/noUnusedVariables: Used in template
function handleDrop(event: DragEvent) {
	event.preventDefault();
	isDragging = false;

	const file = event.dataTransfer?.files[0];
	if (file) {
		handleFile(file);
	}
}

/**
 * Trigger file input click
 */
// biome-ignore lint/correctness/noUnusedVariables: Used in template
function triggerFileInput() {
	fileInputElement.click();
}
</script>

<div
	class="file-upload"
	class:dragging={isDragging}
	on:dragover={handleDragOver}
	on:dragleave={handleDragLeave}
	on:drop={handleDrop}
	role="button"
	tabindex="0"
	on:click={triggerFileInput}
	on:keydown={(e) => e.key === 'Enter' && triggerFileInput()}
>
	<input
		type="file"
		accept=".gds,.gdsii"
		bind:this={fileInputElement}
		on:change={handleFileInput}
		style="display: none;"
	/>

	<div class="upload-content">
		<svg class="upload-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				stroke-width="2"
				d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
			/>
		</svg>
		<p class="upload-text">Drop GDSII file here or click to browse</p>
		<p class="upload-hint">Supports .gds and .gdsii files</p>
	</div>
</div>

<style>
	.file-upload {
		border: 2px dashed #444;
		border-radius: 8px;
		padding: 2rem;
		text-align: center;
		cursor: pointer;
		transition: all 0.2s ease;
		background-color: #1a1a1a;
	}

	.file-upload:hover {
		border-color: #666;
		background-color: #222;
	}

	.file-upload.dragging {
		border-color: #4a9eff;
		background-color: #1a2a3a;
	}

	.upload-content {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
	}

	.upload-icon {
		width: 48px;
		height: 48px;
		color: #888;
	}

	.upload-text {
		margin: 0;
		font-size: 1rem;
		color: #ccc;
	}

	.upload-hint {
		margin: 0;
		font-size: 0.875rem;
		color: #666;
	}
</style>

