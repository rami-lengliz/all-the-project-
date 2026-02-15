-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "postgis";

-- CreateEnum
CREATE TYPE "BookingType" AS ENUM ('DAILY');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('pending', 'confirmed', 'paid', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "PaymentIntentStatus" AS ENUM ('created', 'authorized', 'captured', 'refunded', 'cancelled');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "email" VARCHAR(255),
    "phone" VARCHAR(20),
    "password_hash" VARCHAR(255) NOT NULL,
    "avatarUrl" VARCHAR(500),
    "roles" TEXT[] DEFAULT ARRAY['user']::TEXT[],
    "isHost" BOOLEAN NOT NULL DEFAULT false,
    "verifiedEmail" BOOLEAN NOT NULL DEFAULT false,
    "verifiedPhone" BOOLEAN NOT NULL DEFAULT false,
    "ratingAvg" DECIMAL(3,2) NOT NULL DEFAULT 0,
    "ratingCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "slug" VARCHAR(255) NOT NULL,
    "icon" VARCHAR(100),
    "allowed_for_private" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listings" (
    "id" TEXT NOT NULL,
    "hostId" TEXT NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "images" TEXT[],
    "pricePerDay" DECIMAL(10,2) NOT NULL,
    "location" geometry(Point,4326),
    "address" VARCHAR(500) NOT NULL,
    "rules" TEXT,
    "availability" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "bookingType" "BookingType" NOT NULL DEFAULT 'DAILY',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "listings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookings" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "renterId" TEXT NOT NULL,
    "hostId" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "totalPrice" DECIMAL(10,2) NOT NULL,
    "commission" DECIMAL(10,2) NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'pending',
    "paid" BOOLEAN NOT NULL DEFAULT false,
    "paymentInfo" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "targetUserId" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_logs" (
    "id" TEXT NOT NULL,
    "action" VARCHAR(255) NOT NULL,
    "actorId" TEXT NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_intents" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "renterId" TEXT NOT NULL,
    "hostId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'TND',
    "status" "PaymentIntentStatus" NOT NULL DEFAULT 'created',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_intents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_phone_idx" ON "users"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "categories_slug_key" ON "categories"("slug");

-- CreateIndex
CREATE INDEX "idx_category_slug" ON "categories"("slug");

-- CreateIndex
CREATE INDEX "listings_pricePerDay_idx" ON "listings"("pricePerDay");

-- CreateIndex
CREATE INDEX "listings_categoryId_idx" ON "listings"("categoryId");

-- CreateIndex
CREATE INDEX "listings_isActive_idx" ON "listings"("isActive");

-- CreateIndex
CREATE INDEX "listings_deletedAt_idx" ON "listings"("deletedAt");

-- CreateIndex
CREATE INDEX "bookings_startDate_endDate_idx" ON "bookings"("startDate", "endDate");

-- CreateIndex
CREATE INDEX "bookings_status_idx" ON "bookings"("status");

-- CreateIndex
CREATE UNIQUE INDEX "reviews_bookingId_key" ON "reviews"("bookingId");

-- CreateIndex
CREATE INDEX "reviews_targetUserId_idx" ON "reviews"("targetUserId");

-- CreateIndex
CREATE INDEX "admin_logs_actorId_idx" ON "admin_logs"("actorId");

-- CreateIndex
CREATE INDEX "admin_logs_createdAt_idx" ON "admin_logs"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "payment_intents_bookingId_key" ON "payment_intents"("bookingId");

-- CreateIndex
CREATE INDEX "payment_intents_bookingId_idx" ON "payment_intents"("bookingId");

-- CreateIndex
CREATE INDEX "payment_intents_status_idx" ON "payment_intents"("status");

-- CreateIndex
CREATE INDEX "payment_intents_renterId_idx" ON "payment_intents"("renterId");

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "listings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_renterId_fkey" FOREIGN KEY ("renterId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "listings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_logs" ADD CONSTRAINT "admin_logs_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_renterId_fkey" FOREIGN KEY ("renterId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
