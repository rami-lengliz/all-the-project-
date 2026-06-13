-- Recreate the GiST spatial index on listings.location for PostGIS radius search.
--
-- Why this migration exists:
--   * 20260226000000_add_location_spatial_index created the index with
--     CREATE INDEX CONCURRENTLY, which cannot run inside the migration
--     transaction (it is silently skipped / fails under `migrate`).
--   * 20260425164703_add_chatbot_tables then dropped the index and never
--     recreated it.
--   Result: ST_DWithin radius queries fall back to a sequential scan.
--
-- This recreates the index with a plain CREATE INDEX (transaction-safe) so the
-- planner uses an Index Scan for GET /api/categories/nearby and the AI
-- price-suggestion comparable queries.
--
-- The index is a FUNCTIONAL GiST index on (location::geography): the app calls
-- ST_DWithin(location::geography, ...), and a plain geometry index can never be
-- used by a geography predicate. Drop any older geometry index first.
--
-- Named `listings_location_idx` to match the EXPLAIN ANALYZE shown in the report.
DROP INDEX IF EXISTS "listings_location_idx";
CREATE INDEX IF NOT EXISTS "listings_location_idx"
  ON "listings" USING GIST ((location::geography));
