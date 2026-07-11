import { ApiError, markAttendanceBulk } from "../api-client";
import type { AttendanceSyncResultItem } from "../api-client";
import { listPending, markStatus, removeItem } from "./outbox";

export type { AttendanceSyncResultItem };

let isSyncing = false;
let intervalHandle: ReturnType<typeof setInterval> | null = null;
let onlineHandlerAttached = false;
let messageHandlerAttached = false;

const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((listener) => listener());
}

/** Subscribe to sync start/finish events (used by useSyncStatus()). */
export function onSyncActivity(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function isSyncInProgress(): boolean {
  return isSyncing;
}

/**
 * Drains the outbox by POSTing every pending item to
 * `/attendance/records/bulk` in a single batch. Idempotent-safe to call
 * repeatedly (e.g. from an interval) — it's a no-op if there's nothing
 * pending or a sync is already in flight.
 */
export async function syncNow(): Promise<void> {
  if (isSyncing) return;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;

  const pending = await listPending();
  if (pending.length === 0) return;

  isSyncing = true;
  notify();

  try {
    await Promise.all(pending.map((item) => markStatus(item.clientUuid, "syncing")));

    let results: AttendanceSyncResultItem[];
    try {
      results = await markAttendanceBulk(pending.map((item) => item.payload));
    } catch (error) {
      // Network/server failure (offline, 5xx, auth expired, etc.) — leave
      // everything pending so the next trigger (interval/online/manual)
      // retries the whole batch. Do not mark individual items failed here;
      // "failed" is reserved for server-confirmed per-item validation
      // failures, not "we couldn't even reach the server."
      const isAuthError = error instanceof ApiError && error.status === 401;
      await Promise.all(pending.map((item) => markStatus(item.clientUuid, "pending")));
      if (isAuthError) {
        // Nothing else to do here in Phase 2 — no refresh-token flow wired
        // into the sync engine yet. Left pending for a manual re-login + retry.
      }
      return;
    }

    await Promise.all(
      results.map(async (result) => {
        if (result.status === "failed") {
          await markStatus(result.clientUuid, "failed", result.errorMessage);
        } else {
          // created | updated | unchanged all mean "the server has it" —
          // remove from the outbox rather than keeping a "synced" tombstone.
          await removeItem(result.clientUuid);
        }
      }),
    );
  } finally {
    isSyncing = false;
    notify();
  }
}

/**
 * Wires up the three triggers described in the offline-sync design:
 *  1. the browser `online` event,
 *  2. a periodic interval while online (fallback for iOS Safari, which
 *     doesn't support the Background Sync API),
 *  3. Background Sync API registration where supported (Chrome/Edge/
 *     Android) — the service worker (public/sw.js) posts a message back to
 *     the page on a `sync` event, which we listen for here and trigger
 *     syncNow() from, since Dexie access is kept in the page context only.
 *
 * Returns a cleanup function. Safe to call multiple times (idempotent —
 * won't double-register listeners/intervals).
 */
export function startSyncEngine(intervalMs = 30000): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  const handleOnline = () => void syncNow();

  if (!onlineHandlerAttached) {
    window.addEventListener("online", handleOnline);
    onlineHandlerAttached = true;
  }

  if (!messageHandlerAttached && "serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("message", (event: MessageEvent) => {
      if (event.data?.type === "SMS_SYNC_NOW") {
        void syncNow();
      }
    });
    messageHandlerAttached = true;
  }

  if (intervalHandle) {
    clearInterval(intervalHandle);
  }
  intervalHandle = setInterval(() => {
    if (navigator.onLine) void syncNow();
  }, intervalMs);

  // Best-effort Background Sync registration. Falls back silently to the
  // online-event + interval polling above on browsers without support.
  if ("serviceWorker" in navigator && "SyncManager" in window) {
    navigator.serviceWorker.ready
      .then((registration) => {
        const syncRegistration = registration as ServiceWorkerRegistration & {
          sync?: { register(tag: string): Promise<void> };
        };
        return syncRegistration.sync?.register("attendance-sync");
      })
      .catch(() => {
        // Ignore — interval/online-event fallback covers this browser.
      });
  }

  void syncNow();

  return () => {
    window.removeEventListener("online", handleOnline);
    onlineHandlerAttached = false;
    if (intervalHandle) {
      clearInterval(intervalHandle);
      intervalHandle = null;
    }
  };
}
