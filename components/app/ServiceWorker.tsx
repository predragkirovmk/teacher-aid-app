"use client";

import { useEffect } from "react";
import { demoOnly } from "@/lib/app/api";
import { demoRoutes } from "@/lib/app/demo";
// Loaded with every screen so the browser's install offer is caught whenever it comes.
import "@/lib/app/install";

/** Every screen, so the offline worker (public/app-sw.js) can cache them all on the first visit. */
const ROUTES = [
  "/app",
  "/app/scan",
  "/app/notifications",
  "/app/profile",
  "/app/attendance",
  "/app/summary",
  "/app/practice",
  "/app/leaderboard",
  "/app/schedule",
  "/app/settings",
  "/app/documents",
  "/app/achievements",
  "/app/faq",
  "/app/welcome",
  "/app/qr-kit",
  "/app/subjects",
  // The demo knows its subjects, class codes and alerts by name. A live student's are not known
  // until the API has answered, so their screens are cached as they are visited.
  ...(demoOnly ? demoRoutes() : []),
];

/** The build running in this page (next.config.ts). */
const BUILD = process.env.NEXT_PUBLIC_APP_BUILD;
/** Set once a build's warm-up has been asked for in this session. */
const WARMED = `teacheraid-sw-warmed-${BUILD}`;
/** Screens where a reload would throw away a quiz or a scan in progress. */
const BUSY = ["/app/play", "/app/scan", "/app/checkin", "/app/practice/"];

/**
 * A page resumed from memory, or served from the offline cache on a slow network, keeps running
 * the build it started with. When the app opens or comes back on screen, ask which build is live
 * and reload onto a newer one, once per build so a slow network cannot make it loop.
 */
async function catchUp() {
  if (document.visibilityState !== "visible" || BUSY.some((p) => location.pathname.startsWith(p))) return;
  let live: string | undefined;
  try {
    live = (await (await fetch("/app/build", { cache: "no-store" })).json()).build;
  } catch {
    return; // offline: keep the copy that is here
  }
  if (!live || live === BUILD) return;
  const key = `teacheraid-reloaded-${live}`;
  try {
    if (window.sessionStorage.getItem(key)) return;
    window.sessionStorage.setItem(key, "1");
  } catch {
    return;
  }
  location.reload();
}

/**
 * Registers the offline worker in production, asks it to cache the app once per session and
 * build, and moves an open copy onto a new deploy.
 */
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

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    void catchUp();
    const onShow = () => void catchUp();
    document.addEventListener("visibilitychange", onShow);
    return () => document.removeEventListener("visibilitychange", onShow);
  }, []);

  return null;
}
