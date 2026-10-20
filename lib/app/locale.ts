"use client";

import { useSyncExternalStore } from "react";
import type { Locale } from "./api/types";

/**
 * The interface language. It is a preference of this phone, not demo data: it has to be known on
 * the first paint, offline and before anyone has signed in, so it lives here in its own small store
 * and is pushed to the API (PATCH /me/settings) when the student changes it. Hydration-safe like
 * store.ts: the server always renders Macedonian, the phone's saved choice takes over after.
 */
const KEY = "teacheraid-locale";
const LOCALES: readonly Locale[] = ["mk", "en"];
const DEFAULT: Locale = "mk";

let current: Locale = DEFAULT;
let loaded = false;
const listeners = new Set<() => void>();

function read(): Locale {
  try {
    const saved = window.localStorage.getItem(KEY);
    return LOCALES.includes(saved as Locale) ? (saved as Locale) : DEFAULT;
  } catch {
    // Private mode or blocked storage: the language holds for this session only.
    return current;
  }
}

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  current = read();
}

export const isLocale = (v: unknown): v is Locale => LOCALES.includes(v as Locale);

export function getLocale(): Locale {
  load();
  return current;
}

export function setLocale(locale: Locale) {
  load();
  current = locale;
  try {
    window.localStorage.setItem(KEY, locale);
  } catch {
    // ignore
  }
  listeners.forEach((l) => l());
}

let watching = false;

function subscribe(cb: () => void) {
  load();
  if (!watching) {
    watching = true;
    // Another tab may change the language while this page is open.
    window.addEventListener("storage", (e) => {
      if (e.key !== KEY && e.key !== null) return;
      current = read();
      listeners.forEach((l) => l());
    });
  }
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useLocale(): Locale {
  return useSyncExternalStore(subscribe, getLocale, () => DEFAULT);
}
