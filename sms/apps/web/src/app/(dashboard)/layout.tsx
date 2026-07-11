"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { getAccessToken } from "../../lib/api-client";
import { registerServiceWorker } from "../../lib/offline/register-sw";
import { startSyncEngine } from "../../lib/offline/sync-engine";

/**
 * Minimal authenticated-area guard. Checks for a stored access token on
 * mount and redirects to /login if it's absent. This is intentionally
 * simple for Phase 1 — no auth context/provider, no token refresh, no
 * role-based route gating yet (routes are gated server-side by the API).
 *
 * Phase 2 additions: registers the offline service worker and starts the
 * outbox sync engine for the whole authenticated area, not just the
 * attendance pages, since any Phase 3+ feature reusing the outbox pattern
 * benefits from the same sync loop already running.
 */
export default function DashboardLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      router.replace("/login");
      return;
    }
    setChecked(true);

    registerServiceWorker();
    const stopSyncEngine = startSyncEngine();
    return stopSyncEngine;
  }, [router]);

  if (!checked) {
    return null;
  }

  return <div>{children}</div>;
}
