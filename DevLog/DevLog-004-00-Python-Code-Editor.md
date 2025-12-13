# DevLog-004-00: Python Code Editor with Pyodide

## Metadata
- **Document Version:** 1.0
- **Created:** 2025-12-13
- **Author:** Wentao Jiang
- **Status:** Planning
- **Related Documents:** DevLog-001-mvp-implementation-plan.md

## Changelog
- **v1.1 (2025-12-13):** Refined MVP scope based on stakeholder feedback
  - Removed directory/file management (single file editor only)
  - Added Ctrl/Cmd+Enter keyboard shortcut for code execution
  - Simplified templates: single default example for MVP
  - Removed collaboration features from MVP scope
  - Confirmed lazy loading and timeout features
- **v1.0 (2025-12-13):** Initial planning document

---

## Executive Summary

This document outlines the implementation plan for adding a Python code editor to gdsjam, enabling users to write gdsfactory code in the browser and view the generated GDS layouts in real-time. The feature uses Pyodide (CPython compiled to WebAssembly) to execute Python code client-side, maintaining gdsjam's privacy-first architecture.

## Problem Statement

Current gdsjam is a viewer-only application. Users must:
1. Write gdsfactory code in external editors
2. Execute Python scripts to generate GDS files
3. Upload GDS files to gdsjam for visualization

This creates friction for learning and rapid prototyping workflows, particularly for students and researchers exploring photonics design.

## Solution: In-Browser Python Code Editor

Enable users to write and execute gdsfactory code directly in the browser, with instant visualization of generated layouts.

**Target Users:**
- Students learning photonics/chip design
- Researchers prototyping designs
- Educators teaching GDS layout concepts

**Primary Use Cases:**
- Interactive learning with gdsfactory examples
- Quick experimentation and iteration
- Sharing code snippets with colleagues
- Educational demonstrations

## Technical Feasibility

### Pyodide: Python in WebAssembly

**Pyodide** is a production-ready port of CPython 3.12+ to WebAssembly/Emscripten.

**Key Capabilities:**
- Full CPython interpreter in browser
- 200+ pre-built packages including NumPy, SciPy, pandas
- micropip for installing pure Python packages from PyPI
- Virtual filesystem for file I/O operations
- Mature and actively maintained (v0.29.0 as of Dec 2024)

**gdsfactory Compatibility:**
- Pure Python package (no native extensions)
- Dependencies: NumPy, SciPy (both available in Pyodide)
- Generates GDS files as binary output (capturable via virtual filesystem)
- Expected to work with minimal modifications

**Bundle Size Considerations:**
- Pyodide core: ~6MB (gzipped)
- NumPy: ~10MB
- SciPy: ~20MB
- gdsfactory + dependencies: ~10-20MB (estimated)
- Total: ~50MB initial download

**Mitigation Strategy:**
- Lazy load (only when code editor is opened)
- Cache in IndexedDB (one-time download)
- Show progress indicators during first load
- Use CDN for fast global delivery

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     GDSJam Enhanced                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐         ┌──────────────┐                 │
│  │  Code Editor │         │ File Upload  │                 │
│  │  (Monaco)    │         │  (.gds)      │                 │
│  └──────┬───────┘         └──────┬───────┘                 │
│         │                        │                          │
│         │ Python code            │ Binary GDS               │
│         ▼                        ▼                          │
│  ┌──────────────┐         ┌──────────────┐                 │
│  │   Pyodide    │         │ gdsii parser │                 │
│  │  (Python)    │         │ (JavaScript) │                 │
│  └──────┬───────┘         └──────┬───────┘                 │
│         │                        │                          │
│         │ GDS binary             │ GDSDocument              │
│         ▼                        ▼                          │
│  ┌─────────────────────────────────────┐                   │
│  │     Unified GDS Parser/Converter    │                   │
│  └─────────────┬───────────────────────┘                   │
│                │                                            │
│                │ GDSDocument (internal format)              │
│                ▼                                            │
│  ┌─────────────────────────────────────┐                   │
│  │   Existing Pixi.js Renderer         │                   │
│  │   (LOD, WebGL, Spatial Index)       │                   │
│  └─────────────────────────────────────┘                   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## MVP Feature Set (Revised)

### Core Features

1. **Code Editor**
   - Monaco Editor (VS Code editor component)
   - Python syntax highlighting
   - Basic autocomplete for Python keywords
   - Line numbers and error indicators
   - Single-file editor (no directory/file management)

2. **Code Execution**
   - "Run" button to execute Python code
   - Keyboard shortcut: Ctrl/Cmd+Enter to run
   - Capture GDS output from Pyodide virtual filesystem
   - Parse GDS binary and render in existing viewer
   - Error display in console panel

3. **Default Example**
   - Single default example loaded on first open
   - Example file: `src/components/code/examples/default.py`
   - Complex photonics circuit demonstrating gdsfactory capabilities
   - No template selector for MVP (can be added later)

4. **Code Persistence**
   - Save code to localStorage (survives page refresh)
   - Clear/reset functionality

5. **UI Integration**
   - Tab-based interface: "Upload" tab vs "Code" tab
   - Desktop-first layout (code editor requires keyboard)
   - Mobile: read-only code view with "Open in Desktop" prompt

### Performance Features

6. **Lazy Loading**
   - Pyodide loads only when "Code" tab is opened
   - Progress indicator during initial load
   - Cache in IndexedDB for subsequent visits

7. **Execution Safety**
   - Timeout for long-running code (30 seconds)
   - Memory limit warnings

### Deferred to Post-MVP

- Directory and file management (multi-file projects)
- Template selector with multiple examples
- Code collaboration/sync in sessions
- Advanced autocomplete for gdsfactory API
- Syntax validation before execution
- Code sharing via URL parameters

## Implementation Plan

### Phase 1: Proof of Concept (2-3 days)

**Goal:** Validate gdsfactory works in Pyodide

**Tasks:**
1. Create standalone HTML test page
2. Load Pyodide from CDN
3. Install gdsfactory via micropip
4. Run simple gdsfactory example
5. Capture GDS binary from virtual filesystem
6. Verify output can be parsed by existing gdsii parser

**Success Criteria:**
- gdsfactory installs without errors
- Simple component (e.g., ring resonator) generates valid GDS
- Existing parser can read Pyodide-generated GDS

**Deliverable:** `tests/pyodide-poc.html` with working example

### Phase 2: Core Integration (1 week)

**Tasks:**
1. Add Monaco Editor dependency
2. Create CodeEditor component (Svelte)
3. Create PyodideManager utility class
4. Implement lazy loading with progress indicators
5. Add "Code" tab to main UI
6. Wire up code execution pipeline
7. Add error handling and console output

**Files to Create:**
- `src/components/code/CodeEditor.svelte`
- `src/components/code/CodeConsole.svelte`
- `src/lib/pyodide/PyodideManager.ts`
- `src/components/code/examples/default.py` (already created)

**Files to Modify:**
- `src/App.svelte` (add tab switching)
- `package.json` (add monaco-editor)

### Phase 3: Polish & Optimization (2-3 days)

**Tasks:**
1. Implement IndexedDB caching for Pyodide
2. Add execution timeout (30 seconds)
3. Improve error messages and stack traces
4. Implement Ctrl/Cmd+Enter keyboard shortcut
5. Mobile UI (read-only view with desktop prompt)
6. Add code reset functionality (restore default example)
7. Update documentation

## Technical Decisions

### Decision 1: Monaco Editor vs CodeMirror

**Choice:** Monaco Editor

**Rationale:**
- Industry standard (powers VS Code)
- Excellent TypeScript support
- Built-in Python language support
- Better autocomplete and IntelliSense
- Larger community and ecosystem

**Trade-off:** Larger bundle size (~2MB) vs CodeMirror (~500KB)

### Decision 2: Code Execution Model

**Choice:** Client-side only (no server-side fallback for MVP)

**Rationale:**
- Maintains privacy-first architecture
- Simpler implementation
- Sufficient for educational use cases
- Can add server-side option in v2 if needed

**Limitation:** Large/complex designs may be slow

### Decision 3: Code Sync Strategy

**Choice:** No code sync for MVP

**Rationale:**
- Simplifies implementation significantly
- Code collaboration is complex (operational transform, conflict resolution)
- Focus on single-user experience first
- Can add in v2 if there's demand

**Future:** Could add Y.Text sync in post-MVP

### Decision 4: Mobile Support

**Choice:** Read-only view with desktop prompt

**Rationale:**
- Code editing on mobile is poor UX
- Virtual keyboard obscures editor
- Pyodide bundle size is large for mobile networks
- Focus on desktop experience for MVP

**Implementation:** Detect mobile, show code with "Edit on Desktop" message

### Decision 5: Default Example

**Choice:** Single default example file for MVP

**Rationale:**
- Simplifies UI (no template selector needed)
- Reduces implementation time
- Default example demonstrates gdsfactory capabilities
- Users can modify the example or clear it

**Implementation:** Load `default.py` from examples directory on first open

**Future:** Could add template gallery in v2

## Success Criteria

1. Pyodide loads successfully in <10 seconds on first visit
2. gdsfactory installs and executes without errors
3. Default example runs successfully and renders correctly
4. Generated GDS renders correctly in existing viewer
5. Code persists across page refreshes (localStorage)
6. Ctrl/Cmd+Enter keyboard shortcut executes code
7. Error messages are clear and actionable
8. Execution timeout works (30 seconds)
9. Bundle size increase <5MB (Monaco + Pyodide loader)
10. No regressions in existing upload/render functionality
11. Mobile shows read-only view with desktop prompt

## Future Enhancements (Post-MVP)

- Template selector with multiple examples
- Code collaboration/sync in sessions (Y.js)
- Directory and file management (multi-file projects)
- Advanced autocomplete for gdsfactory API
- Inline documentation and tooltips
- Code snippets library
- Export code as .py file
- Import .py files
- Package version selector
- Server-side execution option for large designs
- User-submitted template gallery
- Code diff view for session participants
- Integrated Python debugger
- Syntax validation before execution
- Code sharing via URL parameters

## References

- Pyodide Documentation: https://pyodide.org/
- gdsfactory Documentation: https://gdsfactory.github.io/
- Monaco Editor: https://microsoft.github.io/monaco-editor/
- Y.js Text Type: https://docs.yjs.dev/api/shared-types/y.text

## Open Questions

1. **gdsfactory Dependencies:** Are all gdsfactory dependencies available in Pyodide?
   - Action: Test in Phase 1 POC

2. **Performance:** What is acceptable execution time for typical designs?
   - Action: Benchmark in Phase 1, gather user feedback

3. **Memory Limits:** What is the practical memory limit for browser execution?
   - Action: Test with progressively larger designs

4. **Version Compatibility:** Which gdsfactory version should we target?
   - Action: Use latest stable version, document in UI

5. **Error Handling:** How to present Python tracebacks in user-friendly way?
   - Action: Design in Phase 2, iterate based on testing

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| gdsfactory incompatible with Pyodide | Medium | High | Phase 1 POC validates before full implementation |
| Bundle size too large | Low | Medium | Lazy loading + caching, acceptable for desktop |
| Execution too slow | Medium | Medium | Set expectations, add server option in v2 |
| Memory issues on large designs | Medium | Medium | Add warnings, document limitations |
| User confusion (code vs upload) | Low | Low | Clear UI tabs, onboarding tooltips |
| Collaboration conflicts | Low | Medium | Host as ground truth, clear ownership model |

## Implementation Status

Status: Planning (Phase 0)

Next Steps:
1. Review and refine feature set with stakeholders
2. Begin Phase 1 POC
3. Document findings and update plan accordingly

