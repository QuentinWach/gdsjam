/**
 * Collaboration Store - Manages collaboration session state
 */

import { writable } from "svelte/store";
import { SessionManager } from "../lib/collaboration/SessionManager";
import type { CollaborationEvent, UserInfo } from "../lib/collaboration/types";
import { DEBUG } from "../lib/config";

interface CollaborationState {
	sessionManager: SessionManager | null;
	isInSession: boolean;
	sessionId: string | null;
	isHost: boolean;
	connectedUsers: UserInfo[];
	userId: string | null;
	fileTransferProgress: number; // 0-100
	fileTransferMessage: string;
	isTransferring: boolean;
}

const initialState: CollaborationState = {
	sessionManager: null,
	isInSession: false,
	sessionId: null,
	isHost: false,
	connectedUsers: [],
	userId: null,
	fileTransferProgress: 0,
	fileTransferMessage: "",
	isTransferring: false,
};

function createCollaborationStore() {
	const { subscribe, set, update } = writable<CollaborationState>(initialState);

	// Initialize session manager
	const sessionManager = new SessionManager();

	// Set initial state with session manager
	set({
		...initialState,
		sessionManager,
		userId: sessionManager.getUserId(),
	});

	// Set up event listener for peer changes
	sessionManager.getProvider().onEvent((event) => {
		if (event.type === "peer-joined" || event.type === "peer-left") {
			if (DEBUG) {
				console.log("[collaborationStore] Peer event:", event);
			}
			// Update connected users list
			update((state) => {
				if (!state.sessionManager) return state;
				return {
					...state,
					connectedUsers: state.sessionManager.getConnectedUsers(),
				};
			});
		}
	});

	// WORKAROUND: Also listen to awareness changes (fallback if WebRTC peers event doesn't fire)
	sessionManager
		.getProvider()
		.getAwareness()
		.on("change", () => {
			if (DEBUG) {
				console.log("[collaborationStore] Awareness changed, updating user list");
			}
			update((state) => {
				if (!state.sessionManager) return state;
				return {
					...state,
					connectedUsers: state.sessionManager.getConnectedUsers(),
				};
			});
		});

	// Clean up on page unload
	if (typeof window !== "undefined") {
		window.addEventListener("beforeunload", () => {
			sessionManager.destroy();
		});
	}

	return {
		subscribe,

		/**
		 * Create a new collaboration session
		 */
		createSession: () => {
			update((state) => {
				if (!state.sessionManager) return state;

				const sessionId = state.sessionManager.createSession();

				if (DEBUG) {
					console.log("[collaborationStore] Created session:", sessionId);
				}

				return {
					...state,
					isInSession: true,
					sessionId,
					isHost: true,
					connectedUsers: state.sessionManager.getConnectedUsers(),
				};
			});
		},

		/**
		 * Join an existing session
		 */
		joinSession: (sessionId: string) => {
			update((state) => {
				if (!state.sessionManager) return state;

				state.sessionManager.joinSession(sessionId);

				if (DEBUG) {
					console.log("[collaborationStore] Joined session:", sessionId);
				}

				return {
					...state,
					isInSession: true,
					sessionId,
					isHost: false,
					connectedUsers: state.sessionManager.getConnectedUsers(),
				};
			});
		},

		/**
		 * Leave current session
		 */
		leaveSession: () => {
			update((state) => {
				if (!state.sessionManager) return state;

				state.sessionManager.leaveSession();

				if (DEBUG) {
					console.log("[collaborationStore] Left session");
				}

				return {
					...state,
					isInSession: false,
					sessionId: null,
					isHost: false,
					connectedUsers: [],
				};
			});
		},

		/**
		 * Update connected users list
		 */
		updateConnectedUsers: () => {
			update((state) => {
				if (!state.sessionManager) return state;

				return {
					...state,
					connectedUsers: state.sessionManager.getConnectedUsers(),
				};
			});
		},

		/**
		 * Get session manager instance
		 */
		getSessionManager: (): SessionManager | null => {
			let manager: SessionManager | null = null;
			update((state) => {
				manager = state.sessionManager;
				return state;
			});
			return manager;
		},

		/**
		 * Upload file to session (host only)
		 */
		uploadFile: async (arrayBuffer: ArrayBuffer, fileName: string) => {
			// Get session manager reference
			const getManager = (): SessionManager => {
				let mgr: SessionManager | null = null;
				update((state) => {
					mgr = state.sessionManager;
					return state;
				});
				if (!mgr) {
					throw new Error("Session manager not initialized");
				}
				return mgr;
			};

			const manager = getManager();

			update((state) => ({
				...state,
				isTransferring: true,
				fileTransferProgress: 0,
				fileTransferMessage: "Starting upload...",
			}));

			try {
				await manager.uploadFile(
					arrayBuffer,
					fileName,
					(progress: number, message: string) => {
						update((state) => ({
							...state,
							fileTransferProgress: progress,
							fileTransferMessage: message,
						}));
					},
					(event: CollaborationEvent) => {
						if (DEBUG) {
							console.log("[collaborationStore] File transfer event:", event);
						}
					},
				);

				// Save to localStorage for session recovery
				const metadata = manager.getFileMetadata();
				if (
					metadata &&
					metadata.fileId &&
					metadata.fileName &&
					metadata.fileHash &&
					metadata.fileSize
				) {
					manager.saveSessionToLocalStorage(
						metadata.fileId,
						metadata.fileName,
						metadata.fileHash,
						metadata.fileSize,
					);
				}

				update((state) => ({
					...state,
					isTransferring: false,
					fileTransferProgress: 100,
					fileTransferMessage: "Upload complete",
				}));
			} catch (error) {
				console.error("[collaborationStore] File upload failed:", error);
				update((state) => ({
					...state,
					isTransferring: false,
					fileTransferProgress: 0,
					fileTransferMessage: "",
				}));
				throw error;
			}
		},

		/**
		 * Download file from session (peer only)
		 */
		downloadFile: async (): Promise<{
			arrayBuffer: ArrayBuffer;
			fileName: string;
			fileHash: string;
		}> => {
			// Get session manager reference
			const getManager = (): SessionManager => {
				let mgr: SessionManager | null = null;
				update((state) => {
					mgr = state.sessionManager;
					return state;
				});
				if (!mgr) {
					throw new Error("Session manager not initialized");
				}
				return mgr;
			};

			const manager = getManager();

			update((state) => ({
				...state,
				isTransferring: true,
				fileTransferProgress: 0,
				fileTransferMessage: "Starting download...",
			}));

			try {
				const result = await manager.downloadFile(
					(progress: number, message: string) => {
						update((state) => ({
							...state,
							fileTransferProgress: progress,
							fileTransferMessage: message,
						}));
					},
					(event: CollaborationEvent) => {
						if (DEBUG) {
							console.log("[collaborationStore] File transfer event:", event);
						}
					},
				);

				// Save to localStorage for session recovery
				const metadata = manager.getFileMetadata();
				if (
					metadata &&
					metadata.fileId &&
					metadata.fileName &&
					metadata.fileHash &&
					metadata.fileSize
				) {
					manager.saveSessionToLocalStorage(
						metadata.fileId,
						metadata.fileName,
						metadata.fileHash,
						metadata.fileSize,
					);
				}

				update((state) => ({
					...state,
					isTransferring: false,
					fileTransferProgress: 100,
					fileTransferMessage: "Download complete",
				}));

				return result;
			} catch (error) {
				console.error("[collaborationStore] File download failed:", error);
				update((state) => ({
					...state,
					isTransferring: false,
					fileTransferProgress: 0,
					fileTransferMessage: "",
				}));
				throw error;
			}
		},

		/**
		 * Check if file is available in session
		 */
		isFileAvailable: (): boolean => {
			let available = false;
			update((state) => {
				if (state.sessionManager) {
					available = state.sessionManager.isFileAvailable();
				}
				return state;
			});
			return available;
		},

		/**
		 * Download file by ID directly (for session recovery)
		 */
		downloadFileById: async (
			fileId: string,
			fileName: string,
			fileHash: string,
		): Promise<{
			arrayBuffer: ArrayBuffer;
			fileName: string;
			fileHash: string;
		}> => {
			const getManager = (): SessionManager => {
				let mgr: SessionManager | null = null;
				update((state) => {
					mgr = state.sessionManager;
					return state;
				});
				if (!mgr) {
					throw new Error("Session manager not initialized");
				}
				return mgr;
			};

			const manager = getManager();

			update((state) => ({
				...state,
				isTransferring: true,
				fileTransferProgress: 0,
				fileTransferMessage: "Recovering file...",
			}));

			try {
				const result = await manager.downloadFileById(
					fileId,
					fileName,
					fileHash,
					(progress: number, message: string) => {
						update((state) => ({
							...state,
							fileTransferProgress: progress,
							fileTransferMessage: message,
						}));
					},
					(event: CollaborationEvent) => {
						if (DEBUG) {
							console.log("[collaborationStore] File recovery event:", event);
						}
					},
				);

				update((state) => ({
					...state,
					isTransferring: false,
					fileTransferProgress: 100,
					fileTransferMessage: "File recovered",
				}));

				return result;
			} catch (error) {
				console.error("[collaborationStore] File recovery failed:", error);
				update((state) => ({
					...state,
					isTransferring: false,
					fileTransferProgress: 0,
					fileTransferMessage: "",
				}));
				throw error;
			}
		},

		/**
		 * Upload file as pending (before session creation)
		 */
		uploadFilePending: async (arrayBuffer: ArrayBuffer, fileName: string) => {
			const getManager = (): SessionManager => {
				let mgr: SessionManager | null = null;
				update((state) => {
					mgr = state.sessionManager;
					return state;
				});
				if (!mgr) {
					throw new Error("Session manager not initialized");
				}
				return mgr;
			};

			const manager = getManager();

			update((state) => ({
				...state,
				isTransferring: true,
				fileTransferProgress: 0,
				fileTransferMessage: "Uploading file...",
			}));

			try {
				await manager.uploadFilePending(
					arrayBuffer,
					fileName,
					(progress: number, message: string) => {
						update((state) => ({
							...state,
							fileTransferProgress: progress,
							fileTransferMessage: message,
						}));
					},
				);

				update((state) => ({
					...state,
					isTransferring: false,
					fileTransferProgress: 100,
					fileTransferMessage: "File ready, create session to share",
				}));
			} catch (error) {
				console.error("[collaborationStore] Pending file upload failed:", error);
				update((state) => ({
					...state,
					isTransferring: false,
					fileTransferProgress: 0,
					fileTransferMessage: "",
				}));
				throw error;
			}
		},

		/**
		 * Check if there's a pending file
		 */
		hasPendingFile: (): boolean => {
			let hasPending = false;
			update((state) => {
				if (state.sessionManager) {
					hasPending = state.sessionManager.hasPendingFile();
				}
				return state;
			});
			return hasPending;
		},

		/**
		 * Get pending file info
		 */
		getPendingFileInfo: (): { fileName: string; fileSize: number } | null => {
			let info: { fileName: string; fileSize: number } | null = null;
			update((state) => {
				if (state.sessionManager) {
					info = state.sessionManager.getPendingFileInfo();
				}
				return state;
			});
			return info;
		},

		/**
		 * Get stored session info from localStorage
		 */
		getStoredSessionInfo: (): {
			fileId: string;
			fileName: string;
			fileHash: string;
			fileSize: number;
		} | null => {
			let info: {
				fileId: string;
				fileName: string;
				fileHash: string;
				fileSize: number;
			} | null = null;
			update((state) => {
				if (state.sessionManager) {
					info = state.sessionManager.loadSessionFromLocalStorage();
				}
				return state;
			});
			return info;
		},

		/**
		 * Update file transfer progress
		 */
		updateFileTransferProgress: (progress: number, message: string) => {
			update((state) => ({
				...state,
				fileTransferProgress: progress,
				fileTransferMessage: message,
			}));
		},

		/**
		 * Reset store
		 */
		reset: () => {
			update((state) => {
				if (state.sessionManager) {
					state.sessionManager.destroy();
				}
				return initialState;
			});
		},
	};
}

export const collaborationStore = createCollaborationStore();
