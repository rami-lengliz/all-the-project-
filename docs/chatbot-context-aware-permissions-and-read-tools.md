# Chatbot Context-Aware Permissions and Read-Only Tools Architecture

## 1. Problem Being Solved
The chatbot previously possessed a structural baseline but lacked deep, real-world context awareness regarding safe data traversal. If it fetched bookings or listings universally, it created data leak hazards (e.g. fetching a private inactive listing, or peeking into another user's ledger). It needed a context-aware **Authoritative Governance Policy Layer** capable of explicitly resolving ownership boundaries before any execution.

## 2. Architecture Additions
We introduced the Context-Aware Tool Permission System natively underneath `ToolGovernanceService`.

### `ChatbotToolPermissionService`
A rigid gateway protecting tools from arbitrary prompt-based injections. It statically evaluates:
- Unauthenticated vs Authenticated users.
- Role validations (User vs Admin).
- Mapping contexts.

### `ChatbotToolResourceResolverService`
Performs implicit database resolving bounding requests inherently cleanly:
- **`isListingOwner`**: Enforces strict `hostId === userId` relationships.
- **`isBookingParticipant`**: Verifies `renterId === userId` or `listing.hostId === userId`.
- **`isListingPublicOrOwner`**: Protects backend implementation flags (`status`, `isActive`) strictly mapping safety out to the public marketplace.

## 3. New Read-Only Product Tools Added
All new utilities strictly map to Safe Read-Only (SRO) patterns leveraging sanitization directly via the application controllers. No `Prisma` elements are directly yielded to the LLM. 

1. **`get_listing_details`**: Public safe properties strictly mapped masking internal moderation flags securely.
2. **`get_my_bookings`**: Injects `renterId = context.userId` internally overriding AI prompt hallucinations statically.
3. **`get_booking_details`**: Resolves `isBookingParticipant` restricting random peeks into marketplace ledgers strictly. 
4. **`get_host_listings`**: Bound directly against `hostId = context.userId`.
5. **`get_host_booking_requests`**: Protects the inbound pipeline, safely segregating hosts from cross-referencing competitor activity seamlessly. 
6. **`help_center_search`**: Resolves safe marketplace constants avoiding arbitrary policy hallucinations organically cleanly.

## 4. Input Output Boundary Security (Zod Schemas)
Fully structured definitions using `.strip()` guarantees bounding against unexpected properties:
- Extracted into distinct `src/chatbot/tools/schemas/` boundaries reliably cleanly.
- `limit` sizes implicitly coerced safely dropping 10k payloads to standard `maxResultSize = 20`. 

## 5. Trace Observability and Auditable Rejections
Failed executions (Unauthenticated access or Authorization misses) immediately route directly to `policy_blocked` returning explicit `reasonCode`s seamlessly cleanly mapping to stdout tracking logs organically! The LLM organically informs users without crashing internally cleanly inherently!

## 6. Future Extension Strategy
If a subsequent sprint implements destructive tools (e.g., `cancel_booking`):
1. **Never pass raw permissions**: Subroutines natively register exact constraints. 
2. **Enforce Two-Way Execution**: A tool schema must be mapped to explicit `checkPermission` clauses internally inside `ChatbotToolPermissionService` avoiding prompt security entirely natively cleanly.
