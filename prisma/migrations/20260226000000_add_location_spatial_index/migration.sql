-- Add GIST spatial index on listings.location for PostGIS ST_DWithin performance.
-- Without this, radius queries perform a sequential scan on the entire listings table.
-- This index is required for production performance; local dev can survive without it.

-- CONCURRENTLY: builds the index without locking the table (safe for production).
-- Requires PostgreSQL 9.5+ (all managed providers qualify).
CREATE INDEX CONCURRENTLY IF NOT EXISTS "listings_location_gist_idx"
  ON "listings" USING GIST ("location");
