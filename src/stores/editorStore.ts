/**
 * Editor Store - Manages Python code editor state and persistence
 *
 * Storage Strategy:
 * - Solo mode: localStorage with key `gdsjam_code_solo`
 * - Session mode: localStorage with key `gdsjam_code_{sessionId}`
 *
 * Features:
 * - Code persistence across page refreshes
 * - Auto-save with debouncing (1 second)
 * - Execution state management
 * - Rate limit countdown tracking
 * - Tab switching (viewer/console)
 */

import { writable } from "svelte/store";

export interface EditorState {
	editorModeActive: boolean;
	code: string;
	consoleOutput: string;
	isExecuting: boolean;
	executionError: string | null;
	rateLimitCountdown: number;
	activeTab: "viewer" | "console";
	monacoLoaded: boolean;
	sessionId: string | null;
}

const initialState: EditorState = {
	editorModeActive: false,
	code: "",
	consoleOutput: "",
	isExecuting: false,
	executionError: null,
	rateLimitCountdown: 0,
	activeTab: "viewer",
	monacoLoaded: false,
	sessionId: null,
};

// Debounce timer for auto-save
let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;
const AUTO_SAVE_DELAY_MS = 1000;

function createEditorStore() {
	const { subscribe, set, update } = writable<EditorState>(initialState);

	return {
		subscribe,

		/**
		 * Enter editor mode
		 */
		enterEditorMode: (sessionId: string | null = null) => {
			update((state) => {
				// Load code from localStorage
				const storageKey = sessionId ? `gdsjam_code_${sessionId}` : "gdsjam_code_solo";
				const savedCode = localStorage.getItem(storageKey);

				return {
					...state,
					editorModeActive: true,
					sessionId,
					code: savedCode || state.code, // Use saved code or keep current code
				};
			});
		},

		/**
		 * Exit editor mode
		 */
		exitEditorMode: () => {
			update((state) => ({
				...state,
				editorModeActive: false,
				sessionId: null,
			}));
		},

		/**
		 * Set code and auto-save to localStorage
		 */
		setCode: (code: string) => {
			update((state) => {
				const newState = { ...state, code };

				// Debounced auto-save
				if (autoSaveTimer) {
					clearTimeout(autoSaveTimer);
				}

				autoSaveTimer = setTimeout(() => {
					const storageKey = state.sessionId
						? `gdsjam_code_${state.sessionId}`
						: "gdsjam_code_solo";
					localStorage.setItem(storageKey, code);
				}, AUTO_SAVE_DELAY_MS);

				return newState;
			});
		},

		/**
		 * Set console output
		 */
		setConsoleOutput: (output: string) => {
			update((state) => ({ ...state, consoleOutput: output }));
		},

		/**
		 * Set executing state
		 */
		setExecuting: (executing: boolean) => {
			update((state) => ({ ...state, isExecuting: executing }));
		},

		/**
		 * Set execution error
		 */
		setExecutionError: (error: string | null) => {
			update((state) => ({ ...state, executionError: error }));
		},

		/**
		 * Set rate limit countdown (in seconds)
		 */
		setRateLimitCountdown: (seconds: number) => {
			update((state) => ({ ...state, rateLimitCountdown: seconds }));
		},

		/**
		 * Switch active tab (viewer/console)
		 */
		switchTab: (tab: "viewer" | "console") => {
			update((state) => ({ ...state, activeTab: tab }));
		},

		/**
		 * Set Monaco loaded state
		 */
		setMonacoLoaded: (loaded: boolean) => {
			update((state) => ({ ...state, monacoLoaded: loaded }));
		},

		/**
		 * Reset to initial state
		 */
		reset: () => {
			set(initialState);
		},
	};
}

export const editorStore = createEditorStore();
