# Server-Side File Storage Implementation

**Date:** 2025-11-24
**Status:** Completed
**Related:** DevLog-001-07 (P2P File Sync Debugging)

---
**CRITICAL CONSTRAINT: NEVER ENABLE BROADCASTCHANNEL**
- `filterBcConns` MUST always be `true` in y-webrtc configuration
- BroadcastChannel causes issues with file sync and session state
- Always force WebRTC connections even for same-browser tabs
---

## Problem Statement

Y.js/y-webrtc file transfer fails due to RTCDataChannel 16KB message size limit. Even with 16KB chunks and Y.js transactions, the session metadata update exceeds the limit and causes connection failures.

**Root Cause:**
- RTCDataChannel has a 16KB maximum message size (Firefox-Chrome compatibility)
- y-webrtc does not implement message chunking (open issue: yjs/y-webrtc#61)
- Y.js updates containing file metadata (7 fields including 64-char hash) exceed 16KB when encoded
- Client attempts to broadcast received updates back to host, causing buffer overflow

## Solution: Server-Side File Storage

Replace P2P file transfer with HTTP-based upload/download. Keep Y.js for session metadata only.

**Advantages:**
- No RTCDataChannel size limits
- Faster and more reliable than WebRTC for large files
- Simpler code (no chunking, no buffer management)
- Better UX (download progress, retry on failure)
- File deduplication via SHA-256 hash

**Trade-offs:**
- Files temporarily stored on server (privacy concern)
- Server bandwidth usage (mitigated by OCI 10TB/month free tier)
- Not purely P2P (acceptable for MVP)

## Architecture Overview

**Current Server:**
- Node.js WebSocket server (ws library)
- Handles y-webrtc signaling only
- Running on OCI instance (146.235.193.141)
- Nginx reverse proxy with SSL (signaling.gdsjam.com)

**Proposed Changes:**
- Add Express.js HTTP server alongside WebSocket server
- Implement REST API for file upload/download
- Store files on filesystem with hash-based naming
- Automatic cleanup of files older than 24 hours

**Data Flow:**
1. Host uploads file via POST /api/files/upload
2. Server saves file as `<sha256-hash>.bin`
3. Server returns fileId (hash)
4. Host stores fileId in Y.js session metadata
5. Y.js syncs metadata to clients via WebRTC
6. Clients download file via GET /api/files/:fileId

## Server Implementation

### Step 1: Update Dependencies

**File:** `server/package.json`

Add dependencies:
```json
{
  "dependencies": {
    "ws": "^8.17.1",
    "express": "^4.18.2",
    "multer": "^1.4.5-lts.1",
    "cors": "^2.8.5"
  }
}
```

Install:
```bash
cd server
pnpm install
```

### Step 2: Create File Storage Directory

```bash
ssh ubuntu@146.235.193.141
sudo mkdir -p /var/gdsjam/files
sudo chown ubuntu:ubuntu /var/gdsjam/files
sudo chmod 755 /var/gdsjam/files
```

### Step 3: Add Environment Variables

**File:** `server/.env`

Add:
```bash
# File storage configuration
FILE_STORAGE_PATH=/var/gdsjam/files
MAX_FILE_SIZE_MB=100
FILE_RETENTION_HOURS=168
```

**Note:** File retention set to 168 hours (7 days) for production use.

### Step 4: Implement File Upload/Download API

**File:** `server/fileStorage.js` (new file)

Create module with:
- `setupFileRoutes(app)` - Configure Express routes
- `POST /api/files` - Handle file upload with multer (RESTful endpoint)
  - Validate file size (max 100MB)
  - Validate GDSII/DXF magic bytes
  - Compute SHA-256 hash
  - Save as `<hash>.bin`
  - Return `{ fileId: hash, size: bytes }`
- `GET /api/files/:fileId` - Stream file download
  - Validate fileId format (64 hex chars)
  - Check file exists
  - Set Content-Type: application/octet-stream
  - Stream file with fs.createReadStream()
- `DELETE /api/files/:fileId` - Delete file (optional, for manual cleanup)

**Security:**
- Token authentication (same as WebSocket)
- CORS whitelist (gdsjam.com, localhost)
- Rate limiting (10 uploads per IP per hour)
- File size validation
- Path traversal prevention (validate fileId is hex only)

### Step 5: Integrate with Existing Server

**File:** `server/server.js`

Changes:
1. Import Express and file storage module
2. Create Express app before HTTP server
3. Add Express middleware (cors, json, urlencoded)
4. Mount file routes: `app.use('/api', fileRoutes)`
5. Pass Express app to HTTP server: `http.createServer(app)`
6. Keep existing WebSocket upgrade handler unchanged

Structure:
```javascript
const express = require('express');
const { setupFileRoutes } = require('./fileStorage');

const app = express();
// ... middleware setup ...
setupFileRoutes(app);

const server = http.createServer(app);
// ... existing WebSocket code ...
```

### Step 6: Implement File Cleanup

**File:** `server/cleanup.js` (new file)

Create cleanup script:
- Find files in FILE_STORAGE_PATH older than FILE_RETENTION_HOURS
- Delete old files
- Log deletion count

**File:** `server/cleanup.sh` (new file)

Wrapper script for cron:
```bash
#!/bin/bash
cd /home/ubuntu/signaling-server
node cleanup.js >> logs/cleanup.log 2>&1
```

**Cron job:**
```bash
# Run cleanup every Sunday at midnight
0 0 * * 0 /home/ubuntu/gdsjam/server/cleanup.sh
```

**Note:** Cleanup runs weekly (Sunday) instead of hourly due to 7-day retention period.

### Step 7: Update Nginx Configuration

**File:** `/etc/nginx/sites-available/signaling.gdsjam.com`

Add location block for API:
```nginx
location /api/ {
    proxy_pass http://localhost:4444;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    
    # File upload settings
    client_max_body_size 100M;
    proxy_read_timeout 300s;
    proxy_send_timeout 300s;
}
```

Reload Nginx:
```bash
sudo nginx -t
sudo systemctl reload nginx
```

## OpenAPI Compliance

The API follows OpenAPI 3.0 standards with:
- RESTful endpoint naming (POST /api/files, not /api/files/upload)
- Complete OpenAPI specification at `/api/openapi.json`
- Interactive Swagger UI documentation at `/api/docs`
- Standardized request/response schemas
- Bearer token authentication

## Testing

### Local Testing

1. Start server: `cd server && pnpm start`
2. Test upload:
```bash
curl -X POST http://localhost:4444/api/files \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -F "file=@test.gds"
```
3. Test download:
```bash
curl http://localhost:4444/api/files/<fileId> \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -o downloaded.gds
```

### API Documentation

- Production docs: https://signaling.gdsjam.com/api/docs
- OpenAPI spec: https://signaling.gdsjam.com/api/openapi.json

### Production Testing

1. Deploy to OCI
2. Test via HTTPS: `https://signaling.gdsjam.com/api/files`
3. Verify file storage in `/var/gdsjam/files`
4. Verify cleanup cron job runs weekly

## Deployment Checklist

- [x] Update server/package.json dependencies (express, multer, cors, dotenv)
- [x] Create /var/gdsjam/files directory
- [x] Add environment variables to server/.env (168h retention)
- [x] Create server/fileStorage.js with OpenAPI spec
- [x] Create server/cleanup.js and cleanup.sh
- [x] Update server/server.js to integrate Express
- [x] Update Nginx configuration for /api/ routes
- [x] Install dependencies: `pnpm install`
- [x] Configure cron job (weekly Sunday cleanup)
- [x] Deploy to production
- [x] Add OpenAPI documentation endpoints
- [x] Test production endpoints
- [ ] Monitor logs and disk usage

## Implementation Summary

**Completed:** 2025-11-24

**Key Changes:**
- Added Express.js HTTP server alongside WebSocket server
- Implemented RESTful file storage API with OpenAPI 3.0 compliance
- File retention: 7 days (168 hours)
- Cleanup schedule: Weekly (Sunday midnight)
- API documentation: Swagger UI at /api/docs
- Storage path: /var/gdsjam/files
- Max file size: 100MB
- Rate limiting: 10 uploads per IP per hour

**Endpoints:**
- POST /api/files - Upload file
- GET /api/files/:fileId - Download file
- DELETE /api/files/:fileId - Delete file
- GET /api/docs - Interactive API documentation
- GET /api/openapi.json - OpenAPI specification

**Security:**
- Bearer token authentication (shared with WebSocket server)
- CORS whitelist
- Rate limiting
- File type validation (GDSII/DXF magic bytes)
- Path traversal prevention
- SHA-256 file deduplication

## Production Testing Results

**Date:** 2025-11-24
**Tester:** Client-side implementation team
**Status:** ALL TESTS PASSED

### Test 1: File Upload

**Endpoint:** `POST /api/files`
**Test File:** `NTNAR04B_100nm_20210714.gds` (456 KB)

**Request:**
```bash
curl -X POST https://signaling.gdsjam.com/api/files \
  -H "Authorization: Bearer <token>" \
  -F "file=@NTNAR04B_100nm_20210714.gds"
```

**Response:** 200 OK
```json
{
  "fileId": "4a9d0dd397e2f128c857aeaa6dd97c6add0c554c1daadc67c28e33843b16316b",
  "size": 467178,
  "deduplicated": false
}
```

**Verification:**
- [PASS] HTTP Status: 200
- [PASS] Response contains `fileId` (SHA-256 hash, 64 hex chars)
- [PASS] Response contains `size` (467178 bytes)
- [PASS] Response contains `deduplicated` flag
- [PASS] Upload time: < 1 second

### Test 2: File Download

**Endpoint:** `GET /api/files/:fileId`

**Request:**
```bash
curl -X GET https://signaling.gdsjam.com/api/files/4a9d0dd397e2f128c857aeaa6dd97c6add0c554c1daadc67c28e33843b16316b \
  -H "Authorization: Bearer <token>" \
  -o downloaded.gds
```

**Response:** 200 OK
- Content-Type: `application/octet-stream`
- Content-Length: `467178`
- Content-Disposition: `attachment; filename="<fileId>.bin"`

**Verification:**
- [PASS] HTTP Status: 200
- [PASS] File size matches: 467178 bytes
- [PASS] Download time: < 1 second
- [PASS] Proper headers set

### Test 3: File Integrity Verification

**Original File Hash:**
```
4a9d0dd397e2f128c857aeaa6dd97c6add0c554c1daadc67c28e33843b16316b
```

**Downloaded File Hash:**
```
4a9d0dd397e2f128c857aeaa6dd97c6add0c554c1daadc67c28e33843b16316b
```

**Result:** HASHES MATCH PERFECTLY

File uploaded and downloaded without corruption. SHA-256 integrity verification passed.

### Test 4: API Documentation

**Swagger UI:** https://signaling.gdsjam.com/api/docs [Working]
**OpenAPI Spec:** https://signaling.gdsjam.com/api/openapi.json [Working]

API is fully documented and compliant with OpenAPI 3.0 standards.

### Security Verification

[PASS] **Authentication:** Bearer token required and working
[PASS] **CORS:** Proper headers set
[PASS] **Path Traversal Prevention:** fileId validated as 64 hex chars
[PASS] **File Deduplication:** SHA-256 based (deduplicated flag in response)

### Test Summary

| Test | Status | Notes |
|------|--------|-------|
| File Upload | PASS | 456 KB file uploaded successfully |
| File Download | PASS | File downloaded with correct size |
| Hash Integrity | PASS | SHA-256 hashes match perfectly |
| API Documentation | PASS | Swagger UI and OpenAPI spec available |
| Authentication | PASS | Bearer token validation working |

**Conclusion:** File server is fully operational and ready for production use!

## Next Steps

See DevLog-001-09 for client-side implementation.

