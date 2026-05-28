-- CreateTable top_up_intents
CREATE TABLE "top_up_intents" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'TND',
    "status" VARCHAR(32) NOT NULL DEFAULT 'pending',
    "provider" VARCHAR(32) NOT NULL DEFAULT 'konnect',
    "provider_ref" VARCHAR(128),
    "redirect_url" VARCHAR(500),
    "paid_at" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "top_up_intents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "top_up_intents_provider_ref_key" ON "top_up_intents"("provider_ref");

-- CreateIndex
CREATE INDEX "top_up_intents_userId_idx" ON "top_up_intents"("userId");

-- AddForeignKey
ALTER TABLE "top_up_intents" ADD CONSTRAINT "top_up_intents_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
