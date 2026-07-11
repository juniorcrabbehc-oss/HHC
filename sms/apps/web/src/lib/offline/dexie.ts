import Dexie, { type Table } from "dexie";

export type OutboxStatus = "pending" | "syncing" | "synced" | "failed";
export type OutboxEntityType = "attendance";

export interface OutboxItem {
  clientUuid: string;
  entityType: OutboxEntityType;
  payload: Record<string, unknown>;
  status: OutboxStatus;
  createdAt: string;
  lastAttemptAt?: string;
  errorMessage?: string;
}

export interface CacheItem {
  key: string;
  value: unknown;
  updatedAt: string;
}

export class SmsOfflineDb extends Dexie {
  outbox!: Table<OutboxItem, string>;
  cache!: Table<CacheItem, string>;

  constructor() {
    super("sms-offline");
    this.version(1).stores({
      // clientUuid is the primary key — see outbox.ts for why.
      outbox: "clientUuid, entityType, status, createdAt",
      cache: "key, updatedAt",
    });
  }
}

let instance: SmsOfflineDb | null = null;

/**
 * Lazily constructs the Dexie database. Must only be called from browser
 * code (event handlers, effects) — never at module top-level — since
 * IndexedDB doesn't exist during Next.js SSR/prerendering.
 */
export function getDb(): SmsOfflineDb {
  if (typeof window === "undefined") {
    throw new Error("SmsOfflineDb is only available in the browser");
  }
  if (!instance) {
    instance = new SmsOfflineDb();
  }
  return instance;
}
