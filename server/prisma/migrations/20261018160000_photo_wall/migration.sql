-- CreateTable
CREATE TABLE "GuestPhoto" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "guestId" UUID NOT NULL,
    "key" VARCHAR(300) NOT NULL,
    "hiddenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuestPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GuestPhoto_eventId_createdAt_idx" ON "GuestPhoto"("eventId", "createdAt");

-- CreateIndex
CREATE INDEX "GuestPhoto_guestId_idx" ON "GuestPhoto"("guestId");

-- AddForeignKey
ALTER TABLE "GuestPhoto" ADD CONSTRAINT "GuestPhoto_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestPhoto" ADD CONSTRAINT "GuestPhoto_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "Guest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

