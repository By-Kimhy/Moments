-- Seating plan: Guest.tableNo (free text) becomes a real table (DiningTable) that guests point to.
-- Existing table numbers are kept: each distinct one per event becomes a table.

-- CreateTable
CREATE TABLE "DiningTable" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "name" VARCHAR(40) NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 10,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "note" VARCHAR(200),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiningTable_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DiningTable_eventId_sortOrder_idx" ON "DiningTable"("eventId", "sortOrder");
CREATE UNIQUE INDEX "DiningTable_eventId_name_key" ON "DiningTable"("eventId", "name");

ALTER TABLE "DiningTable" ADD CONSTRAINT "DiningTable_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Guest" ADD COLUMN "tableId" UUID;

-- Move existing table numbers into tables, numbers in numeric order.
INSERT INTO "DiningTable" ("id", "eventId", "name", "sortOrder", "updatedAt")
SELECT gen_random_uuid(), t."eventId", t."name",
       (ROW_NUMBER() OVER (PARTITION BY t."eventId" ORDER BY (t."name" ~ '^[0-9]+$') DESC, NULLIF(regexp_replace(t."name", '[^0-9]', '', 'g'), '')::int, t."name"))::int,
       CURRENT_TIMESTAMP
FROM (SELECT DISTINCT "eventId", btrim("tableNo") AS "name" FROM "Guest" WHERE btrim(coalesce("tableNo", '')) <> '') t;

UPDATE "Guest" g SET "tableId" = d."id"
FROM "DiningTable" d
WHERE d."eventId" = g."eventId" AND d."name" = btrim(g."tableNo");

ALTER TABLE "Guest" DROP COLUMN "tableNo";

CREATE INDEX "Guest_eventId_tableId_idx" ON "Guest"("eventId", "tableId");
ALTER TABLE "Guest" ADD CONSTRAINT "Guest_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "DiningTable"("id") ON DELETE SET NULL ON UPDATE CASCADE;
