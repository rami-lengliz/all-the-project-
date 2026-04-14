-- CreateTable
CREATE TABLE "ai_search_logs" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "query" TEXT NOT NULL,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "radiusKm" DOUBLE PRECISION,
    "followUpAsked" BOOLEAN NOT NULL DEFAULT false,
    "mode" TEXT NOT NULL,
    "filters" JSONB NOT NULL,
    "resultsCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ai_search_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_search_logs_createdAt_idx" ON "ai_search_logs"("createdAt");
