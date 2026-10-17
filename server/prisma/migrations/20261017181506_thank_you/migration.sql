-- CreateEnum
CREATE TYPE "ThankYouChannel" AS ENUM ('SMS', 'SHARE');

-- CreateEnum
CREATE TYPE "ThankYouStatus" AS ENUM ('QUEUED', 'SENT', 'FAILED');

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "thankYouEn" VARCHAR(1000),
ADD COLUMN     "thankYouKm" VARCHAR(1000);

-- CreateTable
CREATE TABLE "ThankYou" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "guestId" UUID NOT NULL,
    "channel" "ThankYouChannel" NOT NULL,
    "status" "ThankYouStatus" NOT NULL DEFAULT 'QUEUED',
    "language" "Language" NOT NULL DEFAULT 'KM',
    "text" VARCHAR(1600) NOT NULL,
    "error" VARCHAR(300),
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ThankYou_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ThankYou_eventId_status_idx" ON "ThankYou"("eventId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ThankYou_guestId_channel_key" ON "ThankYou"("guestId", "channel");

-- AddForeignKey
ALTER TABLE "ThankYou" ADD CONSTRAINT "ThankYou_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThankYou" ADD CONSTRAINT "ThankYou_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "Guest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
