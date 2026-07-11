"use client";

/**
 * Registers the hand-rolled service worker (public/sw.js). Safe to call
 * more than once — the browser no-ops re-registration of the same script.
 * See the Phase 2 report for why this is hand-rolled rather than next-pwa.
 */
export function registerServiceWorker(): void {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Non-fatal — the app still works online-only without the SW.
    });
  });
}
