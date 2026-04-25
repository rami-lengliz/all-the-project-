# Admin Listing Moderation V2 - Diagnosis & Plan

## 1. Current Architecture Snapshot
**Backend Files Involved**:
- `src/modules/admin/admin.controller.ts`
- `src/modules/admin/admin.service.ts`
- `src/modules/admin/dto/flag-listing.dto.ts`
- `prisma/schema.prisma` (Models: `ListingStatus`, `AdminLog`)

**Frontend Files Involved**:
- `frontend/src/pages/admin/listings.tsx`
- `frontend/src/lib/api/hooks/useAdminListings.ts`
- `frontend/src/lib/api/hooks/useAdminFlagListing.ts`

**Current Admin Routes**:
- `GET /api/admin/listings` (Returns all listings)
- `POST /api/admin/flag` (Logs a flag action)
- `PATCH /api/admin/listings/:id/approve` (Sets status to ACTIVE, isActive to true, no reason supported)
- `PATCH /api/admin/listings/:id/suspend` (Sets status to SUSPENDED, isActive to false, no reason supported)

**Current Capabilities & Missing Pieces**:
- The backend has `approve` and `suspend` endpoints, but they are generic PATCHes that do not accept a `reason`, violating the "Every moderation mutation should support a reason" constraint.
- The logs generated do not capture why a decision was made.
- The UI currently only supports "Flagging" a listing (which is an abstract action). It does not provide explicit Approve/Reject queues or actions.
- The frontend blindly lists all listings without helping operators focus on pending queue items.

## 2. Listing Moderation Target Design
- **Queue/Detail Workflow**: The UI should categorize listings by `status` (PENDING_REVIEW vs ACTIVE vs SUSPENDED), prioritizing the review queue.
- **Approve Action**: Transitions listing from `PENDING_REVIEW` to `ACTIVE`. Optionally accepts a reason.
- **Suspend/Reject Action**: Transitions listing to `SUSPENDED` and disables it. Requires a markdown/text reason.
- **Auditability**: `AdminLog` is written synchronously to capture `actorId`, `action` (`approve_listing` / `suspend_listing`), and `details` (including the precise `reason`).
- **No Ambiguity**: Explicit DTOs (`ModerateListingDto`) rather than generic partial updates.

## 3. Minimal Implementation Plan
**Backend**:
1. Create `ModerateListingDto` (reason: string).
2. Update `admin.controller.ts`: Add `@Body() dto: ModerateListingDto` to `approve` and `suspend`.
3. Update `admin.service.ts`: Pass the reason into the `details` payload of `this.logAction()`.
4. Update `admin.service.ts` `getAllListings(status?: ListingStatus)` to support filtering by status (helps the UI queue).

**Frontend**:
1. Implement `useAdminModerateListing.ts` React Query mutation for `approve` and `suspend`.
2. Update `admin/listings.tsx` to group by `PENDING_REVIEW` vs all other statuses.
3. Replace the abstract "Flag" panel with a specific "Review Actions" panel showing "Approve" and "Suspend" buttons that require a reason if suspending.
