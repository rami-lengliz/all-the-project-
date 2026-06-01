-- Personalization: per-user preference vectors + per-listing embeddings +
-- a UserInteraction log. Powers the home-page "Recommended for you" feed and
-- the listing-detail "You might also like" carousel.

-- 1. Interaction kind enum
CREATE TYPE "InteractionKind" AS ENUM (
    'VIEW',
    'WISHLIST_ADD',
    'WISHLIST_REMOVE',
    'MESSAGE',
    'BOOKING',
    'REVIEW'
);

-- 2. Add per-listing embedding columns (768-d Gemini text-embedding-004)
ALTER TABLE "listings"
    ADD COLUMN "embedding" DOUBLE PRECISION[] NOT NULL DEFAULT '{}',
    ADD COLUMN "embedding_updated_at" TIMESTAMP(3);

-- 3. Add per-user preference vector (averaged from interaction embeddings)
ALTER TABLE "users"
    ADD COLUMN "preference_vector" DOUBLE PRECISION[] NOT NULL DEFAULT '{}',
    ADD COLUMN "preference_vector_updated_at" TIMESTAMP(3);

-- 4. UserInteraction table
CREATE TABLE "user_interactions" (
    "id"         TEXT NOT NULL,
    "user_id"    TEXT NOT NULL,
    "listing_id" TEXT NOT NULL,
    "kind"       "InteractionKind" NOT NULL,
    "weight"     DOUBLE PRECISION NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_interactions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "user_interactions_user_id_created_at_idx"    ON "user_interactions"("user_id", "created_at");
CREATE INDEX "user_interactions_listing_id_created_at_idx" ON "user_interactions"("listing_id", "created_at");
CREATE INDEX "user_interactions_user_id_kind_idx"          ON "user_interactions"("user_id", "kind");

ALTER TABLE "user_interactions"
    ADD CONSTRAINT "user_interactions_user_id_fkey"
        FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "user_interactions_listing_id_fkey"
        FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 5. Missing index on listings.hostId (Prisma stores camelCase without @map)
CREATE INDEX IF NOT EXISTS "listings_hostId_idx" ON "listings"("hostId");
