"use client";

import { useSyncExternalStore } from "react";

/** Chrome's install event; it is not in the DOM types. */
type InstallEvent = Event & {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/**
 * How this phone can install the app: already installed (running from the Home Screen), through
 * the browser's own install dialog (Chrome, Edge, Samsung Internet), by Safari's Share menu (iPhone
 * and iPad, which never prompt), or by the browser menu (anything else).
 */
export type InstallMode = "installed" | "prompt" | "ios" | "manual";

let deferred: InstallEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

// Listen from the moment the app's scripts run: the browser may offer the install before any
// screen that uses it has mounted. The browser's own mini-bar is left alone.
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    deferred = e as InstallEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    installed = true;
    emit();
  });
}

const standalone = () =>
  window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;

const apple = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);

function snapshot(): InstallMode {
  if (installed || standalone()) return "installed";
  if (deferred) return "prompt";
  return apple() ? "ios" : "manual";
}

function subscribe(listener: () => void) {
  const query = window.matchMedia("(display-mode: standalone)");
  listeners.add(listener);
  query.addEventListener("change", listener);
  return () => {
    listeners.delete(listener);
    query.removeEventListener("change", listener);
  };
}

/** The server renders as installed, so an installed app never flashes an install row on launch. */
export const useInstall = () => useSyncExternalStore(subscribe, snapshot, (): InstallMode => "installed");

/**
 * Show the browser's install dialog. An offer can be shown once, so it is spent once it shows;
 * "unavailable" means the browser would not show it, and the caller falls back to instructions.
 */
export async function promptInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  const offer = deferred;
  if (!offer) return "unavailable";
  try {
    await offer.prompt();
  } catch {
    return "unavailable";
  }
  deferred = null;
  emit();
  return (await offer.userChoice).outcome;
}
