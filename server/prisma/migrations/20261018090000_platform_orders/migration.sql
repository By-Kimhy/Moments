-- CreateEnum
CREATE TYPE "PlanOrderPurpose" AS ENUM ('EVENT_PLAN', 'VENDOR_FEATURED', 'PLANNER_SUBSCRIPTION');

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "paidUntil" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Payment" ALTER COLUMN "eventId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "PlanOrder" ADD COLUMN     "organizationId" UUID,
ADD COLUMN     "purpose" "PlanOrderPurpose" NOT NULL DEFAULT 'EVENT_PLAN',
ADD COLUMN     "units" INTEGER,
ADD COLUMN     "userId" UUID,
ADD COLUMN     "vendorId" UUID,
ALTER COLUMN "eventId" DROP NOT NULL,
ALTER COLUMN "plan" DROP NOT NULL,
ALTER COLUMN "requestedById" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "PlanOrder_vendorId_idx" ON "PlanOrder"("vendorId");

-- CreateIndex
CREATE INDEX "PlanOrder_organizationId_idx" ON "PlanOrder"("organizationId");

-- AddForeignKey
ALTER TABLE "PlanOrder" ADD CONSTRAINT "PlanOrder_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanOrder" ADD CONSTRAINT "PlanOrder_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Planner organizations that exist today get 30 days before they need a subscription.
UPDATE "Organization" SET "paidUntil" = now() + interval '30 days';
