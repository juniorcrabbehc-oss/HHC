import { getDb } from "./dexie";
import type { OutboxItem, OutboxStatus } from "./dexie";

export interface AttendanceMarkPayload {
  clientUuid?: string;
  classId: string;
  learnerId: string;
  termId: string;
  date: string;
  status: string;
  notes?: string;
  source?: string;
}

function generateClientUuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID (older browsers).
  return `xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx`.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Enqueues (or updates in place) an attendance mark. If there's already an
 * un-synced outbox item for the same class/learner/date, it's overwritten
 * with the new status and re-marked "pending" — reusing the same
 * `clientUuid` — rather than piling up multiple queued writes for the same
 * "cell" in the register before the first one even syncs.
 */
export async function enqueueAttendanceMark(payload: AttendanceMarkPayload): Promise<string> {
  const db = getDb();

  const existing = await db.outbox
    .where("entityType")
    .equals("attendance")
    .filter((item) => {
      const p = item.payload as unknown as AttendanceMarkPayload;
      return (
        item.status !== "synced" &&
        p.classId === payload.classId &&
        p.learnerId === payload.learnerId &&
        p.date === payload.date
      );
    })
    .first();

  const clientUuid = existing?.clientUuid ?? payload.clientUuid ?? generateClientUuid();

  const item: OutboxItem = {
    clientUuid,
    entityType: "attendance",
    payload: { ...payload, clientUuid },
    status: "pending",
    createdAt: existing?.createdAt ?? new Date().toISOString(),
  };

  await db.outbox.put(item);
  return clientUuid;
}

export function listPending(): Promise<OutboxItem[]> {
  return getDb().outbox.where("status").anyOf(["pending", "failed"]).toArray();
}

export function countPending(): Promise<number> {
  return getDb().outbox.where("status").anyOf(["pending", "syncing", "failed"]).count();
}

export async function getPendingForClassDate(classId: string, date: string): Promise<OutboxItem[]> {
  const items = await getDb()
    .outbox.where("entityType")
    .equals("attendance")
    .toArray();

  return items.filter((item) => {
    const p = item.payload as unknown as AttendanceMarkPayload;
    return p.classId === classId && p.date === date;
  });
}

export async function markStatus(clientUuid: string, status: OutboxStatus, errorMessage?: string): Promise<void> {
  await getDb().outbox.update(clientUuid, {
    status,
    lastAttemptAt: new Date().toISOString(),
    ...(errorMessage !== undefined ? { errorMessage } : {}),
  });
}

export async function removeItem(clientUuid: string): Promise<void> {
  await getDb().outbox.delete(clientUuid);
}
