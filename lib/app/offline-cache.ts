import { demoOnly } from "./api";
import { demoRoutes } from "./demo";

/** Every screen, so the offline worker (public/app-sw.js) can cache them all on the first visit. */
export const APP_ROUTES = [
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
  "/app/privacy",
  "/app/terms",
  "/app/data",
  // The demo knows its subjects, class codes and alerts by name. A live student's are not known
  // until the API has answered, so their screens are cached as they are visited.
  ...(demoOnly ? demoRoutes() : []),
];

/** Ask the worker to cache the screens again, for when the phone's copies were cleared. Quietly does nothing without a worker or a signal. */
export async function warmOfflineCache(): Promise<void> {
  if (!("serviceWorker" in navigator) || !navigator.onLine) return;
  try {
    const registration = await navigator.serviceWorker.getRegistration("/app");
    registration?.active?.postMessage({ type: "warm", routes: APP_ROUTES });
  } catch {
    // no worker: nothing was cached
  }
}
