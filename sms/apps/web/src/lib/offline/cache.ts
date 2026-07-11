import { getDb } from "./dexie";

/**
 * Generic read-cache keyed by string, backed by Dexie's `cache` table.
 * Used for anything the UI needs to keep working offline (e.g. today's
 * class roster) — separate from the `outbox` table, which is write-only.
 */
export async function putCache<T>(key: string, value: T): Promise<void> {
  await getDb().cache.put({ key, value, updatedAt: new Date().toISOString() });
}

export async function getCache<T>(key: string): Promise<T | null> {
  const row = await getDb().cache.get(key);
  return row ? (row.value as T) : null;
}

export function registerCacheKey(classId: string, date: string): string {
  return `attendance-register:${classId}:${date}`;
}
