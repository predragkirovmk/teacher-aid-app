"use client";

import { useSyncExternalStore } from "react";
import { SUBJECTS, type Locale, type SubjectId } from "./data";

export type Checkin = { id: string; subject: SubjectId; at: number };

export type AppState = {
  locale: Locale;
  signedIn: boolean;
  notificationsOn: boolean;
  read: string[];
  checkins: Checkin[];
};

const KEY = "teacheraid-app-v1";

const DEFAULT: AppState = { locale: "mk", signedIn: true, notificationsOn: true, read: [], checkins: [] };

const LOCALES: readonly Locale[] = ["mk", "en"];

const isCheckin = (c: unknown): c is Checkin => {
  const x = c as Partial<Checkin> | null;
  return !!x && typeof x.id === "string" && SUBJECTS.some((s) => s.id === x.subject) && Number.isFinite(x.at);
};

/**
 * Rebuild the state field by field from whatever was saved. A save from an older build, or one
 * edited by hand, keeps its good fields and falls back to the defaults for the rest, so it can
 * never crash a screen.
 */
function sanitize(saved: unknown): AppState {
  const s = saved && typeof saved === "object" ? (saved as Record<string, unknown>) : {};
  return {
    locale: LOCALES.includes(s.locale as Locale) ? (s.locale as Locale) : DEFAULT.locale,
    signedIn: typeof s.signedIn === "boolean" ? s.signedIn : DEFAULT.signedIn,
    notificationsOn: typeof s.notificationsOn === "boolean" ? s.notificationsOn : DEFAULT.notificationsOn,
    read: Array.isArray(s.read) ? s.read.filter((id): id is string => typeof id === "string") : DEFAULT.read,
    checkins: Array.isArray(s.checkins) ? s.checkins.filter(isCheckin) : DEFAULT.checkins,
  };
}

let state: AppState = DEFAULT;
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) state = sanitize(JSON.parse(raw));
  } catch {
    // Private mode or blocked storage: the demo still works for the session.
  }
}

function set(patch: Partial<AppState>) {
  load();
  state = { ...state, ...patch };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  load();
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useApp(): AppState {
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
  setSignedIn: (signedIn: boolean) => set({ signedIn }),
  setNotificationsOn: (notificationsOn: boolean) => set({ notificationsOn }),
  markRead: (id: string) => {
    load();
    if (!state.read.includes(id)) set({ read: [...state.read, id] });
  },
  markAllRead: (ids: string[]) => {
    load();
    set({ read: Array.from(new Set([...state.read, ...ids])) });
  },
  /** One check-in per subject per hour, so a double scan or a refresh does not double count. */
  checkIn: (subject: SubjectId): Checkin => {
    load();
    const recent = state.checkins.find((c) => c.subject === subject && Date.now() - c.at < 60 * 60 * 1000);
    if (recent) return recent;
    const entry = { id: `c-${Date.now()}`, subject, at: Date.now() };
    set({ checkins: [entry, ...state.checkins] });
    return entry;
  },
  reset: () => {
    for (const key of ["teacheraid-shown-attendance", "teacheraid-achievements-seen"]) {
      try {
        window.localStorage.removeItem(key);
      } catch {
        // ignore
      }
    }
    set({ ...DEFAULT });
  },
};
