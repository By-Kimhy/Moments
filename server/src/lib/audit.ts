// Every change to money or attendance records goes through here, inside the same transaction
// as the change, so the log can't miss one.
import type { Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;

export type AuditEntry = {
  eventId: string;
  entity: "event" | "member" | "guest" | "gift" | "checkin";
  entityId: string;
  action: string;
  actorId: string | null;
  before?: unknown;
  after?: unknown;
};

// Dates become ISO strings and BigInts become strings, so any record can be stored as JSON.
const toJson = (value: unknown) =>
  value === undefined || value === null
    ? undefined
    : (JSON.parse(JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? v.toString() : v))) as Prisma.InputJsonValue);

export async function audit(tx: Tx, entry: AuditEntry) {
  await tx.auditLog.create({
    data: {
      eventId: entry.eventId,
      entity: entry.entity,
      entityId: entry.entityId,
      action: entry.action,
      actorId: entry.actorId,
      before: toJson(entry.before),
      after: toJson(entry.after),
    },
  });
}
