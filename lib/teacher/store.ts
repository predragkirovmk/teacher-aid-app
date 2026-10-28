"use client";

import { useSyncExternalStore } from "react";

export type Locale = "mk" | "en";
/** A secondary school says "ученици" and "клас"; a university says "студенти" and "група". */
export type SchoolType = "school" | "university";

export type TeacherState = {
  locale: Locale;
  /** A demo setting for now; the real one is set once per school when the backend exists. */
  schoolType: SchoolType;
};

const KEY = "teacheraid-teacher-v1";

const DEFAULT: TeacherState = { locale: "mk", schoolType: "school" };

const LOCALES: readonly Locale[] = ["mk", "en"];
const SCHOOL_TYPES: readonly SchoolType[] = ["school", "university"];

/** Rebuild the state field by field, so a save from an older build never crashes a screen. */
function sanitize(saved: unknown): TeacherState {
  const s = saved && typeof saved === "object" ? (saved as Record<string, unknown>) : {};
  return {
    locale: LOCALES.includes(s.locale as Locale) ? (s.locale as Locale) : DEFAULT.locale,
    schoolType: SCHOOL_TYPES.includes(s.schoolType as SchoolType) ? (s.schoolType as SchoolType) : DEFAULT.schoolType,
  };
}

let state: TeacherState = DEFAULT;
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = window.localStorage.getItem(KEY);
    state = raw ? sanitize(JSON.parse(raw)) : DEFAULT;
  } catch {
    // Blocked storage: the settings still work until the page is closed.
  }
}

/** The page language follows the setting, for screen readers and the browser's own hyphenation. */
function applyLang() {
  document.documentElement.lang = state.locale;
}

function set(patch: Partial<TeacherState>) {
  load();
  state = { ...state, ...patch };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
  applyLang();
  listeners.forEach((l) => l());
}

let watching = false;

function subscribe(cb: () => void) {
  load();
  // Subscribing happens after hydration, so this is the first safe moment to touch <html>.
  applyLang();
  if (!watching) {
    watching = true;
    // Another window may change the settings while this one is open.
    window.addEventListener("storage", (e) => {
      if (e.key !== KEY && e.key !== null) return;
      loaded = false;
      load();
      applyLang();
      listeners.forEach((l) => l());
    });
  }
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useTeacher(): TeacherState {
  return useSyncExternalStore(
    subscribe,
    () => {
      load();
      return state;
    },
    () => DEFAULT,
  );
}

export const actions = {
  setLocale: (locale: Locale) => set({ locale }),
  setSchoolType: (schoolType: SchoolType) => set({ schoolType }),
};
