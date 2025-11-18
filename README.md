# GDSJam

Collaborative GDSII viewer for semiconductor layout visualization and review.

## Overview

GDSJam is a peer-to-peer web application for viewing and collaborating on GDSII files directly in the browser. Built for academics, chip design newcomers, and the photonics community to promote open-source EDA culture.

## Features (MVP)

- View-only GDSII file rendering with WebGL acceleration
- Real-time collaborative viewing with synchronized viewports
- Commenting and annotation system
- Peer-to-peer architecture (no backend required)
- Offline support via Service Worker caching
- Dark mode interface

## Technology Stack

- **Frontend**: Svelte 5 + TypeScript + Vite
- **Rendering**: Pixi.js (WebGL2)
- **GDSII Parsing**: gdstk via Pyodide (WebAssembly)
- **Collaboration**: Y.js + y-webrtc (CRDT-based sync)
- **Spatial Indexing**: rbush (R-tree)
- **Styling**: Tailwind CSS v4
- **Tooling**: Biome, Vitest, Husky

## Development

```bash
# Install dependencies
pnpm install

# Start dev server
pnpm dev

# Run type checking
pnpm check

# Run linter
pnpm lint

# Run tests
pnpm test
```

## Architecture

- **Coordinate System**: Micrometers (µm)
- **Rendering Strategy**: Hybrid (Container instancing + viewport culling)
- **Session IDs**: Long UUID format for security
- **Target Performance**: 60fps for 100MB files (500K-1M polygons)

## Documentation

See `DevLog/` directory for detailed planning and implementation notes.
