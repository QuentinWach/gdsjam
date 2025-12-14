<script lang="ts">
/**
 * EditorLayout - Responsive layout for code editor
 *
 * Desktop: Split-panel layout (editor left, viewer/console right) with resizable divider
 * Mobile: Three-tab layout (Code / Viewer / Console)
 *
 * Features:
 * - Instant transitions (no animations)
 * - Resizable split panel on desktop
 * - Tab switching on mobile
 * - Execute button with rate limit countdown
 */

import { onMount } from "svelte";
import { editorStore } from "../../stores/editorStore";
import CodeConsole from "./CodeConsole.svelte";
import CodeEditor from "./CodeEditor.svelte";

interface Props {
	onExecute: () => void;
	onClose: () => void;
}

const { onExecute, onClose }: Props = $props();

// Mobile breakpoint
const MOBILE_BREAKPOINT = 1024;
let isMobile = $state(false);

// Split panel state (desktop only)
let splitPosition = $state(50); // percentage
let isDragging = $state(false);

// Mobile tab state
type MobileTab = "code" | "viewer" | "console";
let mobileActiveTab = $state<MobileTab>("code");
let desktopActiveTab = $derived($editorStore.activeTab);

// Execution state
const isExecuting = $derived($editorStore.isExecuting);
const rateLimitCountdown = $derived($editorStore.rateLimitCountdown);
const consoleOutput = $derived($editorStore.consoleOutput);
const executionError = $derived($editorStore.executionError);

// Check if mobile on mount and resize
function checkMobile() {
	isMobile = window.innerWidth < MOBILE_BREAKPOINT;
}

$effect(() => {
	checkMobile();
	window.addEventListener("resize", checkMobile);
	return () => window.removeEventListener("resize", checkMobile);
});

// Handle split panel dragging (desktop only)
function handleMouseDown(event: MouseEvent) {
	if (isMobile) return;
	isDragging = true;
	event.preventDefault();
}

function handleMouseMove(event: MouseEvent) {
	if (!isDragging || isMobile) return;
	const containerWidth = window.innerWidth;
	const newPosition = (event.clientX / containerWidth) * 100;
	splitPosition = Math.max(30, Math.min(70, newPosition)); // Clamp between 30-70%
}

function handleMouseUp() {
	isDragging = false;
	// Trigger ViewerCanvas resize after dragging stops
	triggerViewerResize();
}

// Trigger ViewerCanvas resize by dispatching a custom event
function triggerViewerResize() {
	// Wait for DOM to update, then find ViewerCanvas and trigger resize
	requestAnimationFrame(() => {
		const viewerContainer = document.querySelector(".viewer-container");
		if (viewerContainer) {
			// Dispatch a custom event that ViewerCanvas can listen to
			const resizeEvent = new CustomEvent("viewer-resize");
			viewerContainer.dispatchEvent(resizeEvent);
		}
	});
}

$effect(() => {
	if (isDragging) {
		window.addEventListener("mousemove", handleMouseMove);
		window.addEventListener("mouseup", handleMouseUp);
		return () => {
			window.removeEventListener("mousemove", handleMouseMove);
			window.removeEventListener("mouseup", handleMouseUp);
		};
	}
});

// Tab switching
function switchMobileTab(tab: MobileTab) {
	mobileActiveTab = tab;
}

function switchDesktopTab(tab: "viewer" | "console") {
	editorStore.switchTab(tab);
}

// Execute button handler
function handleExecute() {
	if (isExecuting || rateLimitCountdown > 0) return;
	onExecute();
}

// Move ViewerCanvas into editor layout container
let originalViewerParent: HTMLElement | null = null;
let viewerCanvas: HTMLElement | null = null;

onMount(() => {
	// Find the ViewerCanvas element
	viewerCanvas = document.querySelector(".viewer-container") as HTMLElement;
	if (viewerCanvas) {
		// Store original parent for restoration
		originalViewerParent = viewerCanvas.parentElement;

		// Move ViewerCanvas into the appropriate container (desktop or mobile)
		const targetContainer = isMobile
			? document.getElementById("editor-viewer-container-mobile")
			: document.getElementById("editor-viewer-container");

		if (targetContainer) {
			targetContainer.appendChild(viewerCanvas);
		}
	}

	return () => {
		// Restore ViewerCanvas to original parent on unmount
		if (viewerCanvas && originalViewerParent) {
			originalViewerParent.appendChild(viewerCanvas);
		}
	};
});

// Re-position ViewerCanvas when switching between mobile/desktop
$effect(() => {
	if (!viewerCanvas) return;

	const targetContainer = isMobile
		? document.getElementById("editor-viewer-container-mobile")
		: document.getElementById("editor-viewer-container");

	if (targetContainer && viewerCanvas.parentElement !== targetContainer) {
		targetContainer.appendChild(viewerCanvas);
	}
});

// Execute button label
const executeButtonLabel = $derived(
	isExecuting
		? "Executing..."
		: rateLimitCountdown > 0
			? `Wait ${rateLimitCountdown}s`
			: "Run Code (Ctrl+Enter)",
);
</script>

<div class="editor-layout" class:mobile={isMobile}>
	<!-- Header with Execute and Close buttons -->
	<div class="editor-header">
		<h2 class="editor-title">Python Code Editor</h2>
		<div class="header-actions">
			<button
				class="execute-button"
				onclick={handleExecute}
				disabled={isExecuting || rateLimitCountdown > 0}
				type="button"
			>
				{executeButtonLabel}
			</button>
			<button class="close-button" onclick={onClose} type="button">✕</button>
		</div>
	</div>

	{#if isMobile}
		<!-- Mobile: Three-tab layout -->
		<div class="mobile-tabs">
			<button
				class="tab-button"
				class:active={mobileActiveTab === "code"}
				onclick={() => switchMobileTab("code")}
				type="button"
			>
				Code
			</button>
			<button
				class="tab-button"
				class:active={mobileActiveTab === "viewer"}
				onclick={() => switchMobileTab("viewer")}
				type="button"
			>
				Viewer
			</button>
			<button
				class="tab-button"
				class:active={mobileActiveTab === "console"}
				onclick={() => switchMobileTab("console")}
				type="button"
			>
				Console
			</button>
		</div>

		<div class="mobile-content">
			<!-- Keep all panels in DOM, toggle visibility with CSS -->
			<div class="code-panel" class:hidden={mobileActiveTab !== "code"}>
				<CodeEditor {onExecute} />
			</div>
			<div class="viewer-panel" id="editor-viewer-container-mobile" class:hidden={mobileActiveTab !== "viewer"}>
				<!-- ViewerCanvas will be positioned here via JavaScript -->
			</div>
			<div class="console-panel" class:hidden={mobileActiveTab !== "console"}>
				<CodeConsole stdout={consoleOutput} error={executionError} />
			</div>
		</div>
	{:else}
		<!-- Desktop: Split-panel layout -->
		<div class="split-container">
			<div class="left-panel" style="width: {splitPosition}%">
				<CodeEditor {onExecute} />
			</div>

			<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
			<div class="divider" role="separator" onmousedown={handleMouseDown}></div>

			<div class="right-panel" style="width: {100 - splitPosition}%">
				<!-- Right panel tabs -->
				<div class="desktop-tabs">
					<button
						class="tab-button"
						class:active={desktopActiveTab === "viewer"}
						onclick={() => switchDesktopTab("viewer")}
						type="button"
					>
						Viewer
					</button>
					<button
						class="tab-button"
						class:active={desktopActiveTab === "console"}
						onclick={() => switchDesktopTab("console")}
						type="button"
					>
						Console
					</button>
				</div>

				<div class="desktop-content">
					<!-- Keep both panels in DOM, toggle visibility with CSS -->
					<div class="viewer-panel" id="editor-viewer-container" class:hidden={desktopActiveTab !== "viewer"}>
						<!-- ViewerCanvas will be positioned here via JavaScript -->
					</div>
					<div class="console-panel" class:hidden={desktopActiveTab !== "console"}>
						<CodeConsole stdout={consoleOutput} error={executionError} />
					</div>
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
.editor-layout {
	display: flex;
	flex-direction: column;
	height: 100vh;
	width: 100vw;
	background: #1e1e1e;
	color: #d4d4d4;
}

.editor-header {
	display: flex;
	justify-content: space-between;
	align-items: center;
	padding: 12px 16px;
	background: #252526;
	border-bottom: 1px solid #3e3e42;
}

.editor-title {
	margin: 0;
	font-size: 16px;
	font-weight: 600;
	color: #cccccc;
}

.header-actions {
	display: flex;
	gap: 12px;
}

.execute-button {
	padding: 8px 16px;
	background: #0e639c;
	color: white;
	border: none;
	border-radius: 3px;
	cursor: pointer;
	font-size: 13px;
	font-weight: 500;
	transition: background 0.1s;
}

.execute-button:hover:not(:disabled) {
	background: #1177bb;
}

.execute-button:disabled {
	background: #3e3e42;
	color: #858585;
	cursor: not-allowed;
}

.close-button {
	padding: 8px 12px;
	background: #3e3e42;
	color: #cccccc;
	border: none;
	border-radius: 3px;
	cursor: pointer;
	font-size: 16px;
	line-height: 1;
	transition: background 0.1s;
}

.close-button:hover {
	background: #505050;
}

/* Split panel (desktop) */
.split-container {
	display: flex;
	flex: 1;
	overflow: hidden;
}

.left-panel,
.right-panel {
	display: flex;
	flex-direction: column;
	overflow: hidden;
}

.divider {
	width: 4px;
	background: #3e3e42;
	cursor: col-resize;
	transition: background 0.1s;
}

.divider:hover {
	background: #505050;
}

/* Desktop tabs */
.desktop-tabs {
	display: flex;
	gap: 4px;
	padding: 8px 12px;
	background: #252526;
	border-bottom: 1px solid #3e3e42;
}

.desktop-content {
	flex: 1;
	overflow: hidden;
}

/* Mobile tabs */
.mobile-tabs {
	display: flex;
	gap: 4px;
	padding: 8px 12px;
	background: #252526;
	border-bottom: 1px solid #3e3e42;
}

.mobile-content {
	flex: 1;
	overflow: hidden;
}

.tab-button {
	padding: 8px 16px;
	background: transparent;
	color: #cccccc;
	border: none;
	border-radius: 3px;
	cursor: pointer;
	font-size: 13px;
	transition: background 0.1s;
}

.tab-button:hover {
	background: #3e3e42;
}

.tab-button.active {
	background: #0e639c;
	color: white;
}

.code-panel,
.viewer-panel,
.console-panel {
	height: 100%;
	overflow: hidden;
}

.viewer-panel {
	position: relative;
}

/* Ensure ViewerCanvas fills the viewer panel */
.viewer-panel :global(.viewer-container) {
	width: 100% !important;
	height: 100% !important;
}

/* Hide panels when not active (keep in DOM for ViewerCanvas) */
.hidden {
	display: none !important;
}
</style>
