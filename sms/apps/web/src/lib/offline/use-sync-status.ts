"use client";

import { useEffect, useState } from "react";
import { countPending } from "./outbox";
import { isSyncInProgress, onSyncActivity } from "./sync-engine";

export interface SyncStatus {
  pendingCount: number;
  isSyncing: boolean;
}

/**
 * Polls the outbox count and listens for sync start/finish events. No
 * external state management library — the outbox is the source of truth
 * (IndexedDB), this just re-reads it on a light interval plus whenever the
 * sync engine notifies it did something.
 */
export function useSyncStatus(pollIntervalMs = 3000): SyncStatus {
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      try {
        const count = await countPending();
        if (!cancelled) {
          setPendingCount(count);
          setIsSyncing(isSyncInProgress());
        }
      } catch {
        // IndexedDB not ready yet (e.g. very first render) — ignore, the
        // next poll tick or sync-activity event will catch up.
      }
    }

    void refresh();
    const unsubscribe = onSyncActivity(() => void refresh());
    const interval = setInterval(refresh, pollIntervalMs);

    return () => {
      cancelled = true;
      unsubscribe();
      clearInterval(interval);
    };
  }, [pollIntervalMs]);

  return { pendingCount, isSyncing };
}
