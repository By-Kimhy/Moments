-- CreateEnum
CREATE TYPE "Plan" AS ENUM ('FREE', 'STANDARD', 'PREMIUM');

-- CreateEnum
CREATE TYPE "PlanOrderStatus" AS ENUM ('PENDING', 'PAID', 'CANCELLED');

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "plan" "Plan" NOT NULL DEFAULT 'FREE';

-- CreateTable
CREATE TABLE "PlanOrder" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "plan" "Plan" NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'USD',
    "reference" VARCHAR(12) NOT NULL,
    "status" "PlanOrderStatus" NOT NULL DEFAULT 'PENDING',
    "requestedById" UUID NOT NULL,
    "confirmedById" UUID,
    "paymentId" UUID,
    "paidAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlanOrder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlanOrder_reference_key" ON "PlanOrder"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "PlanOrder_paymentId_key" ON "PlanOrder"("paymentId");

-- CreateIndex
CREATE INDEX "PlanOrder_status_createdAt_idx" ON "PlanOrder"("status", "createdAt");

-- CreateIndex
CREATE INDEX "PlanOrder_eventId_idx" ON "PlanOrder"("eventId");

-- AddForeignKey
ALTER TABLE "PlanOrder" ADD CONSTRAINT "PlanOrder_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanOrder" ADD CONSTRAINT "PlanOrder_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Events that exist before plans keep everything they could do: they become STANDARD.
UPDATE "Event" SET "plan" = 'STANDARD';
