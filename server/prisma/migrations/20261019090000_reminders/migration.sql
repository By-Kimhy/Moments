-- CreateEnum
CREATE TYPE "ReminderKind" AS ENUM ('REPLIES', 'DESK', 'THANKS');

-- CreateTable
CREATE TABLE "EventReminder" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "kind" "ReminderKind" NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventReminder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EventReminder_eventId_kind_key" ON "EventReminder"("eventId", "kind");

-- AddForeignKey
ALTER TABLE "EventReminder" ADD CONSTRAINT "EventReminder_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

