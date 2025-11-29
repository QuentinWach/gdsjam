# DevLog-001-120: Example Files Not Synced to Session Viewers

**Date:** 2024-11-29
**Status:** Fixed
**Severity:** Medium
**Related:** Issue #9 (Show Examples on Front Page)

---

## Summary

Example GDS files loaded from the front page are not synced to collaboration session viewers. The file loads locally for the host but viewers remain in "waiting for host to share a file" state indefinitely.

## Root Cause

The `loadExample()` function in `src/lib/examples/exampleLoader.ts` directly calls `loadGDSIIFromBuffer()` which only updates the local `gdsStore`. It completely bypasses the collaboration file transfer mechanism.

## Affected Code Paths

### Normal File Upload (works correctly)

`FileUpload.svelte` → `handleFile()`:
1. Calls `loadGDSIIFromBuffer(arrayBuffer, fileName)` - loads locally
2. Checks collaboration state and calls:
   - `collaborationStore.uploadFile()` if in session as host
   - `collaborationStore.uploadFilePending()` if not in session (pre-upload for later)

### Example Loading (broken)

`FileUpload.svelte` → `handleExampleClick()` → `loadExample()`:
1. Fetches file from URL
2. Decompresses if gzipped
3. Calls `loadGDSIIFromBuffer()` - loads locally
4. **Missing:** No collaboration upload logic

## Reproduction Steps

**Scenario A - Session created after example:**
1. Open gdsjam in browser
2. Click an example to load it
3. Create a collaboration session
4. Share session link with another browser/tab
5. Viewer joins but sees "waiting for host to share a file"

**Scenario B - Example picked after session:**
1. Create a collaboration session
2. Share session link with another browser/tab
3. Viewer joins and sees waiting message (expected)
4. Host clicks an example to load it
5. Host sees the layout, viewer still waiting (bug)

## Fix Required

Option A: Modify `loadExample()` to return the ArrayBuffer, then add collaboration upload logic in `handleExampleClick()`:

```typescript
async function handleExampleClick(example: Example, event: MouseEvent) {
    // ... existing loading code ...
    const arrayBuffer = await loadExampleAndGetBuffer(example);
    
    // Add collaboration sync (same as handleFile)
    if ($collaborationStore.isInSession && $collaborationStore.isHost) {
        await collaborationStore.uploadFile(arrayBuffer, fileName);
    } else if (!$collaborationStore.isInSession) {
        await collaborationStore.uploadFilePending(arrayBuffer, fileName);
    }
}
```

Option B: Refactor to share a common file handling function between regular uploads and examples.

## Files to Modify

- `src/lib/examples/exampleLoader.ts` - return ArrayBuffer from loadExample
- `src/components/ui/FileUpload.svelte` - add collaboration upload after example load

## Notes

- Examples are fetched from external URLs (HuggingFace, GitHub)
- Some examples are gzip compressed and need decompression before upload
- File sizes range from 12KB to 700KB (should not cause issues)

## Fix Applied

Implemented Option B.1 - extracted sync logic to a shared helper function:

1. **Modified `loadExample()`** in `src/lib/examples/exampleLoader.ts`:
   - Changed return type from `Promise<void>` to `Promise<LoadExampleResult>`
   - Returns `{ arrayBuffer, fileName }` for collaboration sync

2. **Added `syncFileToCollaboration()` helper** in `src/components/ui/FileUpload.svelte`:
   - Handles all three cases: in-session host, not-in-session, and viewer
   - Single source of truth for collaboration sync logic

3. **Updated both handlers** to use the helper:
   - `handleFile()` - for regular file uploads
   - `handleExampleClick()` - for example file loads

Both scenarios now work correctly:
- **Scenario A**: Load example → create session → viewers receive file
- **Scenario B**: Create session → load example → viewers receive file immediately

