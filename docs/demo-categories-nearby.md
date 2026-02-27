# Swagger Demo Runbook — Nearby Categories

## Context
Goal: Demonstrate that `/api/categories/nearby` correctly filters and counts listings based on location and radius.

## Demo Steps (60 seconds)

### 1. Kelibia Search (High Activity)
- **URL**: `http://localhost:3000/api/docs#/categories/CategoriesController_findNearby`
- **Params**:
  - `lat`: `36.8578`
  - `lng`: `11.092`
  - `radiusKm`: `20`
- **Expected Results**:
  - `success: true`
  - Multiple categories returned (e.g., Sports Facilities, Accommodation, Mobility).
  - `count` values reflect listings near Kelibia (at least one > 5).
  - Sorted by `count` DESC.

### 2. Tunis Search (Different Distribution)
- **Params**:
  - `lat`: `36.8065`
  - `lng`: `10.1815`
  - `radiusKm`: `20`
- **Expected Results**:
  - Different categories or different `count` distributions than Kelibia.
  - Sorting maintained (Count DESC then Name ASC).

### 3. includeEmpty Flag
- **Params**:
  - `lat`: `0`
  - `lng`: `0`
  - `includeEmpty`: `true`
- **Expected Results**:
  - All system categories appear even if `count: 0`.
  - Without the flag, the list would be empty for this remote location.

## Success Criteria
- Valid JSON response shape.
- `count` field is a numeric type.
- Accurate location-based filtering (PostGIS).
