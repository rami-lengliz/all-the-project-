# Week 2 Proof — Nearby Categories

## 1. Curl Proof (Kelibia vs Tunis)

### Kelibia
- **Request**: `lat=36.8578 lng=11.092 radiusKm=20`
- **Output**:
```json
{
  "success": true,
  "data": [
    {
      "id": "d6145a12-b970-412b-9ea0-b70fef595286",
      "name": "Sports Facilities",
      "slug": "sports-facilities",
      "icon": "🏟️",
      "count": 7
    },
    {
      "id": "eaf849dd-6c63-4372-a933-7dba2e81085d",
      "name": "Accommodation",
      "slug": "accommodation",
      "icon": "🏠",
      "count": 5
    },
    {
      "id": "5afefd7d-6134-49c5-b20c-d2ff9482915d",
      "name": "Mobility",
      "slug": "mobility",
      "icon": "🚗",
      "count": 3
    },
    {
      "id": "64d721c8-9702-4e2f-a2c4-53b0bd074e73",
      "name": "Sports Equipment",
      "slug": "sports-equipment",
      "icon": "⚽",
      "count": 3
    },
    {
      "id": "ad5c0987-1faa-4ecb-b337-6ecd65d84278",
      "name": "Tools",
      "slug": "tools",
      "icon": "🔧",
      "count": 3
    },
    {
      "id": "b992032f-129c-4ebd-8352-b20522035c03",
      "name": "Water & Beach Activities",
      "slug": "water-beach-activities",
      "icon": "🏖️",
      "count": 3
    },
    {
      "id": "9624f21d-d409-4b61-b110-e512d60fa59c",
      "name": "Other",
      "slug": "other",
      "icon": "📦",
      "count": 2
    }
  ],
  "timestamp": "2026-02-27T02:35:19.261Z"
}
```

### Tunis
- **Request**: `lat=36.8065 lng=10.1815 radiusKm=20`
- **Output**:
```json
{
  "success": true,
  "data": [
    {
      "id": "9624f21d-d409-4b61-b110-e512d60fa59c",
      "name": "Other",
      "slug": "other",
      "icon": "📦",
      "count": 3
    },
    {
      "id": "eaf849dd-6c63-4372-a933-7dba2e81085d",
      "name": "Accommodation",
      "slug": "accommodation",
      "icon": "🏠",
      "count": 2
    },
    {
      "id": "5afefd7d-6134-49c5-b20c-d2ff9482915d",
      "name": "Mobility",
      "slug": "mobility",
      "icon": "🚗",
      "count": 2
    },
    {
      "id": "64d721c8-9702-4e2f-a2c4-53b0bd074e73",
      "name": "Sports Equipment",
      "slug": "sports-equipment",
      "icon": "⚽",
      "count": 2
    },
    {
      "id": "d6145a12-b970-412b-9ea0-b70fef595286",
      "name": "Sports Facilities",
      "slug": "sports-facilities",
      "icon": "🏟️",
      "count": 2
    },
    {
      "id": "ad5c0987-1faa-4ecb-b337-6ecd65d84278",
      "name": "Tools",
      "slug": "tools",
      "icon": "🔧",
      "count": 2
    },
    {
      "id": "b992032f-129c-4ebd-8352-b20522035c03",
      "name": "Water & Beach Activities",
      "slug": "water-beach-activities",
      "icon": "🏖️",
      "count": 2
    }
  ],
  "timestamp": "2026-02-27T02:35:19.348Z"
}
```

## 2. E2E Proof (Terminal Snippet)

```text
node.exe : PASS test/categories-nearby.e2e-spec.ts (8.824 s)
Tests:       11 passed, 11 total
Time:        9.071 s
Ran all test suites matching /test\categories-nearby.e2e-spec.ts/i.
```

## 3. Swagger Demo Runbook
Refer to [docs/demo-categories-nearby.md](./demo-categories-nearby.md) for detailed steps.

## 4. Implementation Notes
- **Sorting**: Implemented `COUNT DESC` then `name ASC`.
- **Empty Categories**: `includeEmpty=true` parameter implemented and verified.
- **Geographic Sensitivity**: Verified that results differ significantly between Kelibia and Tunis based on PostGIS ST_DWithin queries.
- **Caching**: Skipping optional caching as per current priority.
