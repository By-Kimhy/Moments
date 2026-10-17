// The desk's offline store, in IndexedDB on the phone:
// - snapshots: the last guest list downloaded for each event, so the desk opens without wifi
// - outbox: check-ins, walk-ins and gifts not yet confirmed by the API, in the order they were made
// Every queued write carries a clientId the API uses to ignore repeats, so sending one twice is safe.
import { type DBSchema, type IDBPDatabase, openDB } from "idb";
import type { DeskGuestsResponse } from "@api/contract";
import { ClientApiError, clientApi } from "@/lib/client-api";

export type OutboxKind = "checkin" | "walkin" | "gift" | "scan";

export type OutboxOp = {
  clientId: string;
  eventId: string;
  kind: OutboxKind;
  path: string;
  body: Record<string, unknown>;
  createdAt: number;
  /** Set when the API refused it (not a network problem); shown so a person can fix it. */
  error?: string;
};

interface DeskDB extends DBSchema {
  // Keyed by event id (the desk) or "door:<event id>" (the ticket door).
  snapshots: { key: string; value: { eventId: string; data: unknown; savedAt: number } };
  outbox: { key: string; value: OutboxOp; indexes: { byEvent: string } };
}

let dbPromise: Promise<IDBPDatabase<DeskDB>> | null = null;

function db() {
  dbPromise ??= openDB<DeskDB>("moments-desk", 1, {
    upgrade(database) {
      database.createObjectStore("snapshots", { keyPath: "eventId" });
      database.createObjectStore("outbox", { keyPath: "clientId" }).createIndex("byEvent", "eventId");
    },
  });
  return dbPromise;
}

export async function saveSnapshot<T = DeskGuestsResponse>(key: string, data: T) {
  await (await db()).put("snapshots", { eventId: key, data, savedAt: Date.now() });
}

export async function loadSnapshot<T = DeskGuestsResponse>(key: string) {
  return ((await (await db()).get("snapshots", key))?.data as T | undefined) ?? null;
}

export async function enqueue(op: OutboxOp) {
  await (await db()).put("outbox", op);
}

export async function pendingOps(eventId: string) {
  const ops = await (await db()).getAllFromIndex("outbox", "byEvent", eventId);
  return ops.sort((a, b) => a.createdAt - b.createdAt);
}

export async function removeOp(clientId: string) {
  await (await db()).delete("outbox", clientId);
}

export type FlushResult = { sent: number; offline: boolean; failed: OutboxOp[]; conflicts: { op: OutboxOp; message: string }[] };

let flushing: Promise<FlushResult> | null = null;

/**
 * Sends queued writes in order. Stops at the first network failure (still offline) and keeps
 * the rest for later. A write the API refuses is kept with its error so it isn't lost silently;
 * a check-in another phone already made is dropped and reported.
 */
export function flush(eventId: string): Promise<FlushResult> {
  flushing ??= (async () => {
    const result: FlushResult = { sent: 0, offline: false, failed: [], conflicts: [] };
    for (const op of await pendingOps(eventId)) {
      if (op.error) {
        result.failed.push(op);
        continue;
      }
      try {
        await clientApi(op.path, { method: "POST", body: op.body });
        await removeOp(op.clientId);
        result.sent++;
      } catch (e) {
        if (!(e instanceof ClientApiError)) {
          result.offline = true;
          break;
        }
        if (e.status === 409 && (op.kind === "checkin" || op.kind === "scan")) {
          await removeOp(op.clientId);
          result.conflicts.push({ op, message: e.message });
        } else if (e.status >= 500 || e.status === 401 || e.status === 429) {
          // Server trouble or a lost session: try again later rather than give up.
          result.offline = true;
          break;
        } else {
          const failed = { ...op, error: e.message };
          await enqueue(failed);
          result.failed.push(failed);
        }
      }
    }
    return result;
  })().finally(() => {
    flushing = null;
  });
  return flushing;
}

/** Removes everything the desk kept on this phone (guest lists and unsent writes). */
export async function clearDeskData() {
  const database = await db();
  await database.clear("snapshots");
  await database.clear("outbox");
}

/** Unsent writes for any event, so leaving the desk can warn before they are lost. */
export async function allPendingCount() {
  return (await db()).count("outbox");
}
