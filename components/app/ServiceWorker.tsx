"use client";

import { useEffect } from "react";
import { NOTIFS, SUBJECTS } from "@/lib/app/data";

/** Every screen, so the offline worker (public/app-sw.js) can cache them all on the first visit. */
const ROUTES = [
  "/app",
  "/app/scan",
  "/app/notifications",
  "/app/profile",
  "/app/attendance",
  "/app/summary",
  "/app/leaderboard",
  "/app/schedule",
  "/app/settings",
  "/app/documents",
  "/app/achievements",
  "/app/faq",
  "/app/welcome",
  "/app/qr-kit",
  ...SUBJECTS.flatMap((s) => [`/app/subject/${s.id}`, `/app/play/${s.code}`, `/app/checkin/${s.code}`]),
  ...NOTIFS.map((n) => `/app/notifications/${n.id}`),
];

/** Set once this session's warm-up has been asked for. */
const WARMED = "teacheraid-sw-warmed";

/** Registers the offline worker in production and asks it to cache the app once per session. */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/app-sw.js", { scope: "/app", updateViaCache: "none" }).catch(() => undefined);
    void navigator.serviceWorker.ready.then((registration) => {
      if (!navigator.onLine) return;
      try {
        if (window.sessionStorage.getItem(WARMED)) return;
        window.sessionStorage.setItem(WARMED, "1");
      } catch {
        // no storage: warm up on every load
      }
      registration.active?.postMessage({ type: "warm", routes: ROUTES });
    });
  }, []);
  return null;
}
