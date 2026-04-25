# Week Summary — AI Engine v1

## What shipped
- Comparables-first pricing: numeric range from PostGIS comps, AI for explanation only
- `nearBeach` / `propertyType` / `guestsCapacity` / `bedrooms` added to comp SQL query (scoring now uses real data)
- `normalizeFilters` category whitelist (`stays`, `sports-facilities`, `mobility`, `beach-gear`)
- Guardrail spread tightened ±40% → ±20% (villa/house ranges no longer overlap)
- `reset:demo` npm script (`migrate reset --force` → `generate` → `seed`)
- Golden queries fixture (10 queries), category-guardrail E2E suite, smoke test scripts

## How to run
```bash
npm run reset:demo        # clean DB + seed
npm run start:dev         # API on :3001
npm run test:golden       # regression suite (mocked, ~30s)
npm run test:category-guard  # whitelist guardrail
```

## Key endpoints
| Endpoint | Purpose |
|----------|---------|
| `GET  /api/categories/nearby` | PostGIS radius → categories with counts |
| `POST /api/ai/search` | NL query → RESULT or FOLLOW_UP |
| `POST /api/ai/price-suggestion` | Comp-driven range + AI explanation |

## Known issues
- `priceSuggestionLog` write fails (`column "category_slug" does not exist`) — fire-and-forget, no user impact
- FOLLOW_UP mode requires a live AI key; falls back to RESULT without one

## Next week
- Fix `priceSuggestionLog` schema mismatch
- UI integration: expose `followUp.question` to the search frontend
- Monitor `AiSearchLog` for hallucination patterns in production
