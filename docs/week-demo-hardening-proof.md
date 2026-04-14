# Week Demo Hardening Proof

This document provides evidence and verification steps for the critical hardening tasks completed to ensure a flawless, offline-capable, and reliable demo environment.

---

## 1. Refresh Token Flow Proof

**Behavior Implemented:**
- **Interception:** On receiving a `401 Unauthorized` response from any protected endpoint, the Axios interceptor pauses the request.
- **Refresh Attempt:** It automatically attempts a `POST /api/auth/refresh` using the stored `refreshToken`.
- **Retry Logic:** If the refresh succeeds, the new access token is stored, and the original request is retried seamlessly.
- **Queueing:** Concurrent 401 requests are queued while the single refresh request is in flight to prevent infinite loops and race conditions.
- **Logout:** If the refresh attempt fails (e.g., token expired), the session is cleared, and the user is immediately redirected to `/auth/login`.

**Files Touched:**
- `frontend/src/lib/api/client.ts` (Axios interceptor configuration)
- `frontend/src/lib/auth/AuthProvider.tsx` (LocalStorage `re_auth_v1` synchronization)

**Manual Verification Steps:**
1. Log in to the application to acquire valid tokens.
2. Open Chrome DevTools > Application tab > Local Storage.
3. Manually alter the `accessToken` inside the `re_auth_v1` payload to a randomly corrupted string (simulating expiration).
4. Navigate to a protected route (e.g., Profile or Dashboard).
5. Open the Network tab: observe the `401 Unauthorized` request, followed instantly by a `/api/auth/refresh` request, followed by a successful retry of the original request.

---

## 2. Demo Images Reliability Proof

**Behavior Implemented:**
To guarantee the demo works fully offline and without visually broken image icons, all frontend image rendering has been hardened with local fallback capabilities.

- **Placeholder Asset:** A permanent local asset was created at `frontend/public/placeholder.png`.
- **Fallback Logic:** `onError` handlers were meticulously added to every primary `<img/>` component. If a primary image URL fails to resolve or 404s, the React component dynamically swaps the `src` to `/placeholder.png` without crashing.
- **Dependencies Removed:** All instances of `https://via.placeholder.com` were purged from the UI, successfully eliminating external DNS lookups.
- **Seed Resilience:** The backend database seeder (`src/database/seeds/seed.service.ts`) was updated. Missing demo images pointing to non-existent `/uploads/` paths were replaced natively with `/placeholder.png`.

**Files Touched:**
- `frontend/public/placeholder.png`
- `frontend/src/components/shared/ListingCard.tsx`
- `frontend/src/pages/index.tsx`
- `frontend/src/pages/listings/[id].tsx`
- `frontend/src/pages/profile.tsx`
- `frontend/src/pages/host/listings.tsx`
- `frontend/src/pages/host/dashboard.tsx`
- `frontend/src/pages/client/bookings.tsx`
- `frontend/src/pages/booking/[id].tsx`
- `frontend/src/pages/admin/listings.tsx`
- `src/database/seeds/seed.service.ts`

**Manual Verification Steps:**
1. Disable internet access on the host machine to simulate an offline demo.
2. Load the frontend at `http://localhost:3001` completely offline.
3. Scroll through the homepage, listing details, and user profiles.
4. **Network Tab Expectation:** Observe **0** `ERR_NAME_NOT_RESOLVED` errors and **0** broken image tags floating on the screens. Local placeholders cover all gaps natively.

---

## 3. OpenAPI `/api/api` Fix Proof

**Behavior Implemented:**
The frontend auto-generated API bindings were double-prefixing URLs (e.g., `GET /api/api/listings`), resulting in frontend 404 crashes.

- **Root Cause:** A stale version of `frontend/openapi.json` generated from an older NestJS configuration was hardcoding `/api` blindly on top of the backend `@Controller('api/...')` routes.
- **Resolution:** We ran the `npm run generate:api` script connected to the live backend Swagger JSON. This cleansed the OpenAPI schema and regenerated accurate services.

**Before/After:**
- **Before:** `ListingsService.listingsControllerFindAll()` called `/api/api/listings`
- **After:** `ListingsService.listingsControllerFindAll()` calls `/api/listings`

**Files Touched:**
- `frontend/openapi.json`
- `frontend/src/lib/api/generated/services/*.ts`

**Manual Verification Steps:**
1. Boot both frontend and backend.
2. Go to the search page in the frontend UI.
3. Observe network requests correctly firing exactly to `http://localhost:3000/api/listings` and succeeding.

---

## 4. Listing Orphan Insert Fix Proof

**Behavior Implemented:**
Previously, if a request to create a listing omitted an attached image file, the database would insert the Postgres row *before* throwing the validation error, stranding an undeletable orphan listing in the database.

- **Fix:** We moved the logical `imageFiles` payload validation to the very first line of execution within `ListingsService.create()`. If no file exists, the service throws an HTTP `400 BadRequestException` immediately, preventing PostGIS / Prisma `$executeRaw` logic from ever mutating the database.

**Files Touched:**
- `src/modules/listings/listings.service.ts`
- `test/listings-create.e2e-spec.ts`

**Manual Verification Steps & E2E:**
1. We authored `test/listings-create.e2e-spec.ts`.
2. The endpoint is hit via `$ supertest` missing an image buffer.
3. **Expected:** Returns status **400** with message `"At least one image is required"`, and the overarching `prisma.listing.count()` asserts that **zero** new rows leaked into the database.

---

## 5. `debug_findAll.log` Confirmation

**Behavior Implemented:**
Unnecessary disk IO writes were eliminated from the `GET /api/listings` route.

- **Evidence:** We exhaustively ran global Regex queries across all backend Typescript source (`grep debug_findAll` and `grep appendFile`). The system returned **0 results**.
- **Historical Note:** The log was patched out previously under commit `63986b8e9c6c...`. Code scans confirm it no longer exists.

**Manual Verification Steps:**
1. Navigate to your terminal.
2. Query the endpoint heavily: `curl -s http://localhost:3000/api/listings > out.json`
3. Check the host directory for `debug_findAll.log`. It will mathematically not exist.

---

## Demo Rehearsal Checklist (Verify in 10 Minutes)

Run through this checklist shortly before you deliver your presentation:

- [ ] **Database Integrity:** Execute `npm run seed` to ensure a clean demo slate.
- [ ] **Offline capability:** Disable Wi-Fi, open `localhost:3001` in Incognito, and verify profiles and listing cards display the local `placeholder.png` gracefully without erroring network requests.
- [ ] **Token Expiry test:** Log into a user session, manually modify `re_auth_v1` in `localStorage`, refresh the page, and ensure you remain seamlessly logged in via background silent refresh.
- [ ] **Listing Form validation:** Attempt to create an empty listing via UI and guarantee the modal yields an error instantly instead of successfully navigating away.
- [ ] **Terminal Cleanness:** Double-check the backend Node terminal. Ensure there are no random file writes or `.log` crashes looping.

---

## Commands Reference

Here are the critical verification console commands:

**Run the Orphan Listing Protection Test:**
```bash
npm run test:e2e test/listings-create.e2e-spec.ts
```

**Run Full System Conflict Protection:**
```bash
npm run test:e2e test/booking-conflict.e2e-spec.ts
```

**Regenerate / Check OpenAPI bindings:**
```bash
cd frontend
npm run generate:api
```

**Test debug_findAll.log absence:**
```bash
curl -s http://localhost:3000/api/listings > NUL
dir debug_findAll.log
# Will return File Not Found
```
