export type EmbedViewerState = {
	fileName: string | null;
	isLoading: boolean;
	progress: number;
	message: string;
	error: string | null;
};

export type EmbedAPIInitOptions = {
	loadUrl: (url: string) => Promise<void>;
	getState: () => EmbedViewerState;
};

type IncomingMessage = { type: "gdsjam:loadFile"; url: string } | { type: "gdsjam:getState" };

type OutgoingMessage =
	| { type: "gdsjam:ready" }
	| { type: "gdsjam:fileLoaded"; url: string; fileName?: string }
	| { type: "gdsjam:error"; message: string }
	| { type: "gdsjam:state"; state: EmbedViewerState };

/**
 * EmbedAPI - optional postMessage bridge for iframe embedding.
 *
 * Incoming (parent -> iframe):
 * - { type: "gdsjam:loadFile", url }
 * - { type: "gdsjam:getState" }
 *
 * Outgoing (iframe -> parent):
 * - { type: "gdsjam:ready" }
 * - { type: "gdsjam:fileLoaded", url, fileName? }
 * - { type: "gdsjam:error", message }
 * - { type: "gdsjam:state", state }
 */
export class EmbedAPI {
	private opts: EmbedAPIInitOptions | null = null;
	private boundOnMessage: ((event: MessageEvent) => void) | null = null;

	init(opts: EmbedAPIInitOptions): void {
		this.opts = opts;
		this.boundOnMessage = (event: MessageEvent) => {
			this.handleMessage(event);
		};
		window.addEventListener("message", this.boundOnMessage);
	}

	destroy(): void {
		if (this.boundOnMessage) {
			window.removeEventListener("message", this.boundOnMessage);
		}
		this.boundOnMessage = null;
		this.opts = null;
	}

	notifyReady(): void {
		this.post({ type: "gdsjam:ready" });
	}

	notifyFileLoaded(payload: { url: string; fileName?: string }): void {
		this.post({ type: "gdsjam:fileLoaded", url: payload.url, fileName: payload.fileName });
	}

	notifyError(message: string): void {
		this.post({ type: "gdsjam:error", message });
	}

	private post(msg: OutgoingMessage): void {
		// Intentionally use "*" so embed works on arbitrary parent sites.
		// If you want stricter security, provide an allowlist and validate event.origin.
		window.parent?.postMessage(msg, "*");
	}

	private async handleMessage(event: MessageEvent): Promise<void> {
		const data = event.data as IncomingMessage | unknown;
		if (!data || typeof data !== "object") return;
		if (!("type" in (data as any))) return;

		const message = data as IncomingMessage;
		if (!this.opts) return;

		if (message.type === "gdsjam:loadFile") {
			if (typeof message.url !== "string" || message.url.length === 0) {
				this.notifyError("Invalid loadFile request: missing url");
				return;
			}
			await this.opts.loadUrl(message.url);
			return;
		}

		if (message.type === "gdsjam:getState") {
			this.post({ type: "gdsjam:state", state: this.opts.getState() });
		}
	}
}
