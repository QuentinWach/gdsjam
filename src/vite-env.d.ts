/// <reference types="vite/client" />

interface ImportMetaEnv {
	readonly VITE_DEBUG: string;
	readonly VITE_MAX_POLYGONS_PER_RENDER: string;
	readonly VITE_FPS_UPDATE_INTERVAL: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
