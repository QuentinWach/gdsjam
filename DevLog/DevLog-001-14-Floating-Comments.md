# DevLog-001-14: Floating Comments Feature

**Issue**: #49  
**Status**: Planning  
**Date**: 2025-12-09

## Overview

Implement a floating comment system that allows users to annotate GDS layouts with text comments tied to world coordinates. Comments persist in localStorage for solo use and sync via Y.js in collaboration sessions.

## Requirements

### Core Features
- Toggle comment mode with keyboard shortcut `c`
- Click canvas to place comment at world coordinates
- Simple text input modal (center screen, no animation)
- Display comments as user initial bubbles
- Click bubble once: show first 140 characters
- Click again: expand to full content (max 1000 characters)
- Hold `c` to show/hide all comments
- Touch control button for mobile

### Comment Panel
- Right-side panel (hidden by default)
- Double-click `c` or mobile button to toggle
- Chronological list of all comments
- Click comment to recenter viewport (respects viewport sync priority)
- Independent visibility from canvas comment bubbles
- Host controls: enable/disable viewer comments, clear all, delete individual

### Display Specifications
- User initial bubble: small icon size (24px)
- Color: canvas background grey with light white outline
- Text: light white, matching scale bar styling
- Font size: match page footnote
- Timestamp: absolute + relative, click to toggle
- Dark theme throughout
- NO ANIMATIONS - instant transitions only

### Permissions & Limits
- Viewer commenting: OFF by default
- Host can enable/disable viewer commenting
- Host can delete individual comments
- Host can clear all comments
- Max 100 comments per session
- Rate limiting: viewer 1/min, host 1/10s (client-side)

### Storage & Persistence
- Solo mode: localStorage
- Collaboration: Y.js session-specific (cleared on session end)
- Comments tied to world/database coordinates
- Survive page refresh (localStorage for solo, Y.js for collab)
- Cleared on file change
- Persist through host transfer (new host inherits controls)

### Desktop Interaction
- Cursor change when in comment mode
- Keyboard `c`: toggle comment mode
- Hold `c`: show/hide all comments
- Double-click `c`: toggle comment panel

### Mobile Interaction
- Comment button in FAB menu
- Toggle button to show/hide comments
- Button to open comment panel

## Design Intent

Follow Figma-style comment pattern: minimal visual footprint with progressive disclosure. Comments should not clutter the layout view but remain easily accessible. Prioritize performance and instant feedback (no animations per project requirements).

## Technical Specifications

### Data Model
```typescript
interface Comment {
  id: string;              // UUID
  userId: string;          // Author user ID
  displayName: string;     // Author display name
  content: string;         // Comment text (max 1000 chars)
  worldX: number;          // World/database coordinate X
  worldY: number;          // World/database coordinate Y
  timestamp: number;       // Unix timestamp
  createdAt: number;       // Unix timestamp
}

interface CommentPermissions {
  viewersCanComment: boolean;  // Default: false
}

interface CommentRateLimit {
  userId: string;
  lastCommentTime: number;
}
```

### Storage Architecture
- **Solo mode**: `localStorage.setItem('gdsjam_comments_<fileHash>', JSON.stringify(comments))`
- **Collaboration**: Y.js shared array `ydoc.getArray<Comment>('comments')`
- **Permissions**: Y.js shared map `sessionMap.get('commentPermissions')`
- **Rate limiting**: In-memory map, reset on session change

### Coordinate System
Store comments in database units (same as GDS coordinates) for consistency with existing architecture. Transform to screen coordinates for rendering using existing viewport transformation utilities.

## Implementation Plan

### Phase 1: Data Model & Storage (Foundation)
1. Create `src/lib/comments/types.ts` - Comment interfaces
2. Create `src/stores/commentStore.ts` - Svelte store for comment state
3. Add comment storage to localStorage (solo mode)
4. Add Y.js shared array for comments in `SessionManager.ts`
5. Add comment permissions to Y.js session map
6. Implement rate limiting logic in comment store

**Reference**: 
- `src/stores/layerStore.ts` for store pattern
- `src/lib/collaboration/SessionManager.ts` for Y.js integration
- `src/lib/collaboration/types.ts` for data structure patterns

### Phase 2: Comment Creation (Core Feature)
1. Register keyboard shortcut `c` in `KeyboardShortcutManager`
2. Implement comment mode state (cursor change on desktop)
3. Add canvas click handler for comment placement
4. Create `CommentInputModal.svelte` - text input UI (center screen, no animation)
5. Implement character limit validation (140 preview, 1000 max)
6. Save comment to store (localStorage or Y.js based on session state)
7. Auto-disable comment mode after submission
8. Enforce rate limiting and permissions

**Reference**:
- `src/lib/keyboard/KeyboardShortcutManager.ts` for keyboard shortcuts
- `src/components/ui/ErrorToast.svelte` for modal pattern
- `src/lib/renderer/PixiRenderer.ts` for coordinate transformation

### Phase 3: Comment Display on Canvas
1. Create `CommentBubble.svelte` - user initial bubble component
2. Render comment bubbles on canvas overlay (not in WebGL)
3. Transform world coordinates to screen coordinates
4. Implement click handlers: first click = show 140 chars, second = expand full
5. Implement timestamp display (absolute + relative, click to toggle)
6. Implement hold `c` to show/hide all comments
7. Update bubbles on viewport pan/zoom

**Reference**:
- `src/components/ui/Minimap.svelte` for overlay rendering pattern
- `src/components/ui/ParticipantList.svelte` for user display pattern
- Viewport transformation from `PixiRenderer`

### Phase 4: Comment Panel
1. Create `CommentPanel.svelte` - right-side panel component
2. Display chronological list of comments
3. Implement double-click `c` to toggle panel
4. Add mobile button to toggle panel
5. Implement click-to-recenter viewport (respect viewport sync priority)
6. Add host controls: enable/disable viewer comments, clear all
7. Add delete button for individual comments (host only)
8. Panel visibility independent of canvas comment visibility

**Reference**:
- `src/components/ui/LayerPanel.svelte` for panel structure and styling
- `src/components/ui/ParticipantList.svelte` for list rendering
- `src/stores/panelZIndexStore.ts` for panel z-index management

### Phase 5: Mobile Support
1. Add comment button to `MobileControls.svelte` FAB menu
2. Add toggle button for comment visibility
3. Add button to open comment panel
4. Ensure touch-friendly comment interaction

**Reference**:
- `src/components/ui/MobileControls.svelte` for FAB menu pattern

### Phase 6: Integration & Polish
1. Handle file change: clear comments
2. Handle host transfer: preserve comments, transfer controls
3. Handle page refresh: reload from localStorage/Y.js
4. Enforce 100 comment limit per session
5. Test coordinate transformation accuracy
6. Test collaboration sync
7. Performance optimization for many comments

**Reference**:
- `src/lib/collaboration/HostManager.ts` for host transfer logic
- `src/App.svelte` for file change handling

## Files to Create
- `src/lib/comments/types.ts`
- `src/stores/commentStore.ts`
- `src/components/ui/CommentInputModal.svelte`
- `src/components/ui/CommentBubble.svelte`
- `src/components/ui/CommentPanel.svelte`

## Files to Modify
- `src/lib/keyboard/KeyboardShortcutManager.ts` - Add `c` shortcut
- `src/components/viewer/ViewerCanvas.svelte` - Render comment bubbles, handle click
- `src/components/ui/MobileControls.svelte` - Add comment buttons
- `src/lib/collaboration/SessionManager.ts` - Add comment Y.js integration
- `src/lib/collaboration/types.ts` - Add comment types to Y.js session data
- `src/App.svelte` - Handle file change comment clearing

## Success Criteria
- Comments appear at correct world coordinates regardless of zoom/pan
- Comments persist across page refresh (localStorage for solo, Y.js for collab)
- Host controls work correctly (enable/disable, delete, clear all)
- Rate limiting enforced (1/min viewer, 1/10s host)
- No animations anywhere in comment system
- Mobile touch controls functional
- Comment panel displays chronological list with viewport recentering
- Performance remains smooth with 100 comments

