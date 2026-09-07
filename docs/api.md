# API Reference

Base URL: `http://localhost:4000/api/v1`

## Response Envelope

Success:

```json
{ "success": true, "data": ... }
```

Error:

```json
{ "success": false, "error": { "code": "...", "message": "...", "details": ... } }
```

Error codes: `BAD_REQUEST` (400), `UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `CONFLICT` (409), `INTERNAL_ERROR` (500).

## Health

### GET /health

No auth. Returns `{ status, service, time }`.

## Authentication

### POST /auth/register

Body: `{ name: string (2–100), email: string, password: string (8–72) }`

Creates an INSPECTOR-role account (role assignment is not exposed via the public API). Returns the created user (never the password hash). 409 CONFLICT if the email exists.

### POST /auth/login

Body: `{ email, password }`

Returns `{ token, user }`. 401 on bad credentials.

### POST /auth/logout

Requires Bearer token. Stateless logout — the client discards the token. Reserved for future token revocation.

### GET /auth/me

Requires Bearer token. Returns the current user.

## Inspections

All inspection endpoints require authentication. Creation additionally requires INSPECTOR or ADMIN role.

### POST /inspections

Creates a DRAFT inspection with a generated `inspectionNumber` (INS-YYYYMMDD-XXXXXX).

Body:

```json
{
  "packageType": "RETAIL" | "WHOLESALE" | "IMPORTED" | "UNKNOWN",
  "inspectionDate": "ISO date (optional, default now)",
  "location": "string (optional)",
  "notes": "string (optional)",
  "product": { "name": "required if product given", "genericName": "...", "brand": "...", "manufacturer": "...", "category": "..." }
}
```

Returns the created inspection including nested product and inspector summary.

### GET /inspections

Lists the most recent 100 inspections (product + inspector summaries included).

### GET /inspections/:inspectionId

Returns one inspection with product, inspector, and image summaries. 404 if not found or not accessible to the caller (INSPECTORs see only their own; REVIEWER/VIEWER/ADMIN see all).

### POST /inspections/:id/images

**INSPECTOR/ADMIN only; own inspection only.** Multipart form with one or more files under `images` (max 8, 10 MB each).

Validation per file: allowed type (JPEG/PNG/WEBP), non-empty, genuinely decodable, true dimensions read from pixels, and declared MIME must match actual content (sniffed). Files are stored under server-generated UUID keys — user filenames are kept only as `originalFilename` metadata, never used as storage paths.

Response (201 when all succeed, 207 when some fail):

```json
{ "success": true, "data": { "uploaded": [ { "id", "storageKey", "url", "originalFilename", "mimeType", "fileSize", "width", "height", "sequence", "uploadStatus" } ], "failed": [ { "originalFilename", "reason" } ] } }
```

Valid files are saved even when others in the batch fail (one bad capture never discards good ones).

### GET /inspections/:id/images

Lists the inspection's images ordered by `sequence`.

### DELETE /inspections/:id/images/:imageId

**INSPECTOR/ADMIN only; own inspection only.** Deletes the image record and file, then closes sequence gaps.

### PATCH /inspections/:id/images/reorder

**INSPECTOR/ADMIN only; own inspection only.** Body `{ "orderedIds": [uuid, ...] }` — must contain exactly the inspection's image ids. Persists the new order and returns the resequenced list.

### GET /api/v1/storage/images/...

**Authenticated.** Serves stored package photographs. These are enforcement evidence, so they sit behind the JWT (a bare `<img src>` cannot carry the token; the frontend loads them as blobs via the authenticated client).

## Inspection numbers

`INS-YYYY-NNNNNN` (e.g. `INS-2026-000001`) — a sequential per-year business number generated under a Postgres advisory lock with an `InspectionCounter` table. It is unique and human-readable but is **not** the primary key; the DB id is a UUID.

## Auth Header

```
Authorization: Bearer <token>
```

The token payload carries `{ sub, email, role }`; `requireAuth` verifies it and populates `req.user`; `requireRole(...)` enforces RBAC.
