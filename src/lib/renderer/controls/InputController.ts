/**
 * Input Controller
 * Coordinates mouse, keyboard, and touch input controllers
 */

import { KeyboardController } from "./KeyboardController";
import { MouseController } from "./MouseController";
import { TouchController } from "./TouchController";

export interface InputControllerCallbacks {
	onZoom: (
		zoomFactor: number,
		centerX: number,
		centerY: number,
		worldPosX: number,
		worldPosY: number,
	) => void;
	onPan: (dx: number, dy: number) => void;
	onFitToView: () => void;
	onToggleGrid: () => void;
	onCoordinatesUpdate: (mouseX: number, mouseY: number) => void;
	getScreenCenter: () => { x: number; y: number };
}

export class InputController {
	private mouseController: MouseController;
	private keyboardController: KeyboardController;
	private touchController: TouchController;

	constructor(canvas: HTMLCanvasElement, callbacks: InputControllerCallbacks) {
		// Create mouse controller
		this.mouseController = new MouseController(canvas, {
			onZoom: callbacks.onZoom,
			onPan: callbacks.onPan,
			onCoordinatesUpdate: callbacks.onCoordinatesUpdate,
		});

		// Create keyboard controller
		this.keyboardController = new KeyboardController({
			onPan: callbacks.onPan,
			onZoom: callbacks.onZoom,
			onFitToView: callbacks.onFitToView,
			onToggleGrid: callbacks.onToggleGrid,
			getScreenCenter: callbacks.getScreenCenter,
		});

		// Create touch controller
		this.touchController = new TouchController(canvas, {
			onPan: callbacks.onPan,
			onZoom: callbacks.onZoom,
			onCoordinatesUpdate: callbacks.onCoordinatesUpdate,
		});
	}

	destroy(): void {
		this.mouseController.destroy();
		this.keyboardController.destroy();
		this.touchController.destroy();
	}
}
