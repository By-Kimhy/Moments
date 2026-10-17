// Deleting an account. Records other people rely on stay (a wedding's gift book, reviews, the
// audit log), but nothing in them points to the person any more: their name, phone number and
// Telegram account are wiped, and signing in again with the same Telegram starts a new account.
import { prisma } from "../db.js";
import { HttpError } from "../errors.js";
import { audit } from "./audit.js";

export const DELETED_NAME = "Deleted user";

export async function deleteAccount(userId: string) {
  return prisma.$transaction(async (tx) => {
    // An organization must keep an owner while others still work in it.
    const owned = await tx.organizationMember.findMany({ where: { userId, role: "OWNER", revokedAt: null }, include: { organization: { select: { name: true } } } });
    for (const m of owned) {
      const others = await tx.organizationMember.count({ where: { organizationId: m.organizationId, revokedAt: null, userId: { not: userId } } });
      const otherOwners = await tx.organizationMember.count({ where: { organizationId: m.organizationId, revokedAt: null, role: "OWNER", userId: { not: userId } } });
      if (others > 0 && otherOwners === 0) {
        throw new HttpError(409, `Make someone else an owner of ${m.organization.name} first.`);
      }
    }

    const now = new Date();
    const memberships = await tx.eventMember.findMany({ where: { userId, revokedAt: null } });
    let archived = 0;
    for (const m of memberships) {
      await tx.eventMember.update({ where: { id: m.id }, data: { revokedAt: now } });
      if (m.role !== "OWNER") continue;
      // An event nobody else can run any more is archived: its invitations stop taking replies.
      const event = await tx.event.findUniqueOrThrow({ where: { id: m.eventId }, select: { status: true, organizationId: true } });
      const otherHosts = await tx.eventMember.count({ where: { eventId: m.eventId, role: "OWNER", revokedAt: null } });
      const planner = event.organizationId ? await tx.organizationMember.count({ where: { organizationId: event.organizationId, revokedAt: null, userId: { not: userId } } }) : 0;
      if (otherHosts === 0 && planner === 0 && event.status !== "ARCHIVED") {
        await tx.event.update({ where: { id: m.eventId }, data: { status: "ARCHIVED" } });
        archived++;
      }
      await audit(tx, { eventId: m.eventId, entity: "member", entityId: m.id, action: "account_deleted", actorId: m.id });
    }
    await tx.organizationMember.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } });
    await tx.vendor.updateMany({ where: { ownerId: userId, status: { not: "SUSPENDED" } }, data: { status: "SUSPENDED", reviewNote: "Account deleted" } });
    await tx.user.update({ where: { id: userId }, data: { name: DELETED_NAME, phone: null, telegramId: null, isAdmin: false, deletedAt: now } });
    return { archivedEvents: archived };
  });
}
