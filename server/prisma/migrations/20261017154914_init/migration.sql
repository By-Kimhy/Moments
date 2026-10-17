-- CreateEnum
CREATE TYPE "Language" AS ENUM ('KM', 'EN');

-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('WEDDING', 'TICKETED');

-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "MemberRole" AS ENUM ('OWNER', 'HELPER');

-- CreateEnum
CREATE TYPE "Side" AS ENUM ('BRIDE', 'GROOM', 'BOTH');

-- CreateEnum
CREATE TYPE "RsvpStatus" AS ENUM ('PENDING', 'ATTENDING', 'DECLINED');

-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('USD', 'KHR');

-- CreateEnum
CREATE TYPE "GiftMethod" AS ENUM ('CASH', 'KHQR');

-- CreateEnum
CREATE TYPE "GiftStatus" AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED');

-- CreateEnum
CREATE TYPE "GiftSource" AS ENUM ('DESK', 'GUEST', 'HOST');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "TemplateStyle" AS ENUM ('TRADITIONAL', 'MODERN', 'MINIMAL');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "phone" VARCHAR(20),
    "telegramId" BIGINT,
    "language" "Language" NOT NULL DEFAULT 'KM',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "type" "EventType" NOT NULL DEFAULT 'WEDDING',
    "status" "EventStatus" NOT NULL DEFAULT 'DRAFT',
    "titleKm" VARCHAR(200) NOT NULL,
    "titleEn" VARCHAR(200),
    "brideNameKm" VARCHAR(120),
    "brideNameEn" VARCHAR(120),
    "groomNameKm" VARCHAR(120),
    "groomNameEn" VARCHAR(120),
    "startsAt" TIMESTAMP(3) NOT NULL,
    "venueKm" VARCHAR(300),
    "venueEn" VARCHAR(300),
    "mapUrl" VARCHAR(500),
    "schedule" JSONB NOT NULL DEFAULT '[]',
    "photos" JSONB NOT NULL DEFAULT '[]',
    "khqrImageKey" VARCHAR(300),
    "khqrAccountName" VARCHAR(120),
    "templateId" UUID,
    "helperCode" VARCHAR(6) NOT NULL,
    "telegramChatId" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventMember" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "userId" UUID,
    "role" "MemberRole" NOT NULL,
    "displayName" VARCHAR(120) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Guest" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "clientId" UUID,
    "name" VARCHAR(160) NOT NULL,
    "nameAlt" VARCHAR(160),
    "phone" VARCHAR(20),
    "side" "Side" NOT NULL DEFAULT 'BOTH',
    "group" VARCHAR(80),
    "invitedCount" INTEGER NOT NULL DEFAULT 1,
    "inviteToken" VARCHAR(32) NOT NULL,
    "rsvpStatus" "RsvpStatus" NOT NULL DEFAULT 'PENDING',
    "rsvpCount" INTEGER,
    "rsvpMessage" VARCHAR(500),
    "rsvpAt" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3),
    "tableNo" VARCHAR(20),
    "walkIn" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Guest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Gift" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "clientId" UUID,
    "guestId" UUID,
    "giverName" VARCHAR(160),
    "amount" INTEGER NOT NULL,
    "currency" "Currency" NOT NULL,
    "method" "GiftMethod" NOT NULL,
    "status" "GiftStatus" NOT NULL DEFAULT 'CONFIRMED',
    "source" "GiftSource" NOT NULL,
    "note" VARCHAR(500),
    "recordedById" UUID,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),
    "voidedAt" TIMESTAMP(3),
    "voidedById" UUID,
    "voidReason" VARCHAR(300),
    "paymentId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Gift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "provider" VARCHAR(40) NOT NULL,
    "reference" VARCHAR(120) NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" "Currency" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "providerPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Checkin" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "guestId" UUID NOT NULL,
    "clientId" UUID,
    "peopleCount" INTEGER NOT NULL DEFAULT 1,
    "checkedInById" UUID NOT NULL,
    "checkedInAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Checkin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Template" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(60) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "style" "TemplateStyle" NOT NULL,
    "previewUrl" VARCHAR(500),
    "config" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "entity" VARCHAR(40) NOT NULL,
    "entityId" UUID NOT NULL,
    "action" VARCHAR(40) NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "actorId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "User_telegramId_key" ON "User"("telegramId");

-- CreateIndex
CREATE UNIQUE INDEX "Event_helperCode_key" ON "Event"("helperCode");

-- CreateIndex
CREATE INDEX "Event_ownerId_idx" ON "Event"("ownerId");

-- CreateIndex
CREATE INDEX "EventMember_eventId_idx" ON "EventMember"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "EventMember_eventId_userId_key" ON "EventMember"("eventId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Guest_inviteToken_key" ON "Guest"("inviteToken");

-- CreateIndex
CREATE INDEX "Guest_eventId_side_idx" ON "Guest"("eventId", "side");

-- CreateIndex
CREATE INDEX "Guest_eventId_name_idx" ON "Guest"("eventId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Guest_eventId_clientId_key" ON "Guest"("eventId", "clientId");

-- CreateIndex
CREATE UNIQUE INDEX "Gift_paymentId_key" ON "Gift"("paymentId");

-- CreateIndex
CREATE INDEX "Gift_eventId_status_idx" ON "Gift"("eventId", "status");

-- CreateIndex
CREATE INDEX "Gift_eventId_guestId_idx" ON "Gift"("eventId", "guestId");

-- CreateIndex
CREATE UNIQUE INDEX "Gift_eventId_clientId_key" ON "Gift"("eventId", "clientId");

-- CreateIndex
CREATE INDEX "Payment_eventId_status_idx" ON "Payment"("eventId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_provider_reference_key" ON "Payment"("provider", "reference");

-- CreateIndex
CREATE UNIQUE INDEX "Checkin_eventId_guestId_key" ON "Checkin"("eventId", "guestId");

-- CreateIndex
CREATE UNIQUE INDEX "Checkin_eventId_clientId_key" ON "Checkin"("eventId", "clientId");

-- CreateIndex
CREATE UNIQUE INDEX "Template_slug_key" ON "Template"("slug");

-- CreateIndex
CREATE INDEX "AuditLog_eventId_entity_entityId_idx" ON "AuditLog"("eventId", "entity", "entityId");

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventMember" ADD CONSTRAINT "EventMember_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventMember" ADD CONSTRAINT "EventMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Guest" ADD CONSTRAINT "Guest_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Gift" ADD CONSTRAINT "Gift_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Gift" ADD CONSTRAINT "Gift_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "Guest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Gift" ADD CONSTRAINT "Gift_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "EventMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Gift" ADD CONSTRAINT "Gift_voidedById_fkey" FOREIGN KEY ("voidedById") REFERENCES "EventMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Gift" ADD CONSTRAINT "Gift_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Checkin" ADD CONSTRAINT "Checkin_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Checkin" ADD CONSTRAINT "Checkin_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "Guest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Checkin" ADD CONSTRAINT "Checkin_checkedInById_fkey" FOREIGN KEY ("checkedInById") REFERENCES "EventMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "EventMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;
