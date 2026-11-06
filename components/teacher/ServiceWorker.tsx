"use client";

import { useEffect } from "react";
// Loaded with every screen so the browser's install offer is caught whenever it comes.
import "@/lib/app/install";
import { SHELL_ROUTES } from "@/lib/teacher/routes";

/** The build running in this page (next.config.ts). Set once a build's warm-up has been asked for in this session. */
const WARMED = `teacheraid-teacher-sw-warmed-${process.env.NEXT_PUBLIC_APP_BUILD}`;

/**
 * Registers the offline worker (public/teacher-sw.js) in production and asks it to keep the shell of the app, once per
 * session and build. The worker keeps no data: see its header.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/teacher-sw.js", { scope: "/teacher", updateViaCache: "none" }).catch(() => undefined);
    void navigator.serviceWorker.ready.then((registration) => {
      if (!navigator.onLine) return;
      try {
        if (window.sessionStorage.getItem(WARMED)) return;
        window.sessionStorage.setItem(WARMED, "1");
      } catch {
        // no storage: warm up on every load
      }
      registration.active?.postMessage({ type: "warm", routes: SHELL_ROUTES });
    });
  }, []);

  return null;
}
