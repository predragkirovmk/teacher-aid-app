"use client";

import { useSyncExternalStore } from "react";
import { DEFAULT_PROFILE, isAvatar, type Profile } from "./avatars";
import { CLOCKS, demoTime, type ClockId } from "./clock";
import { SUBJECTS, type Locale, type SubjectId } from "./data";

export type Checkin = { id: string; subject: SubjectId; at: number };

export type AppState = {
  locale: Locale;
  signedIn: boolean;
  notificationsOn: boolean;
  read: string[];
  checkins: Checkin[];
  /** The display name and avatar the student chose; null name means the school account's. */
  profile: Profile;
  /** Points earned in live quizzes, added to the class leaderboard (spec 13.1). */
  quizPoints: number;
  /** Whether the student has answered a question in a live quiz (the First answer achievement). */
  quizAnswered: boolean;
  /** Whether a whole live quiz was answered right, which unlocks the Perfect quiz achievement. */
  perfectQuiz: boolean;
  /** The time the demo runs on: the phone's clock, or a moment picked in Settings. */
  clock: ClockId;
};

const KEY = "teacheraid-app-v1";

const DEFAULT: AppState = {
  locale: "mk",
  signedIn: true,
  notificationsOn: true,
  read: [],
  checkins: [],
  profile: DEFAULT_PROFILE,
  quizPoints: 0,
  quizAnswered: false,
  perfectQuiz: false,
  clock: "real",
};

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
    profile: sanitizeProfile(s.profile),
    quizPoints:
      typeof s.quizPoints === "number" && Number.isFinite(s.quizPoints) && s.quizPoints >= 0
        ? Math.floor(s.quizPoints)
        : DEFAULT.quizPoints,
    quizAnswered: typeof s.quizAnswered === "boolean" ? s.quizAnswered : DEFAULT.quizAnswered,
    perfectQuiz: typeof s.perfectQuiz === "boolean" ? s.perfectQuiz : DEFAULT.perfectQuiz,
    clock: CLOCKS.includes(s.clock as ClockId) ? (s.clock as ClockId) : DEFAULT.clock,
  };
}

function sanitizeProfile(saved: unknown): Profile {
  const p = saved && typeof saved === "object" ? (saved as Record<string, unknown>) : {};
  const name = typeof p.name === "string" && p.name.trim() ? p.name.trim().slice(0, 40) : null;
  return { name, avatar: isAvatar(p.avatar) ? p.avatar : DEFAULT_PROFILE.avatar };
}

let state: AppState = DEFAULT;
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = window.localStorage.getItem(KEY);
    state = raw ? sanitize(JSON.parse(raw)) : DEFAULT;
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

/** Read the saved state again and redraw, for when it may have changed outside this page. */
function reload() {
  loaded = false;
  load();
  listeners.forEach((l) => l());
}

let watching = false;

function subscribe(cb: () => void) {
  load();
  if (!watching) {
    watching = true;
    // Another tab may change the saved data while this page is open.
    window.addEventListener("storage", (e) => {
      if (e.key === KEY || e.key === null) reload();
    });
    // A page restored from the back-forward cache (Back after logging out on a newer page) holds
    // old data, and its router does not navigate reliably, so load it again if the save changed.
    window.addEventListener("pageshow", (e) => {
      if (!e.persisted) return;
      try {
        const raw = window.localStorage.getItem(KEY);
        const saved = raw ? sanitize(JSON.parse(raw)) : DEFAULT;
        if (JSON.stringify(saved) !== JSON.stringify(state)) window.location.reload();
      } catch {
        // blocked storage: nothing newer to read
      }
    });
  }
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
  /** One check-in per subject per hour, so a double scan or a refresh does not double count. Stamped
      with the demo's time, so a scan at a picked moment lands in that moment's lesson. */
  checkIn: (subject: SubjectId): Checkin => {
    load();
    const now = demoTime(state.clock, Date.now());
    const recent = state.checkins.find((c) => c.subject === subject && Math.abs(now - c.at) < 60 * 60 * 1000);
    if (recent) return recent;
    const entry = { id: `c-${Date.now()}`, subject, at: now };
    set({ checkins: [entry, ...state.checkins] });
    return entry;
  },
  setProfile: (profile: Profile) => set({ profile }),
  setClock: (clock: ClockId) => set({ clock }),
  addQuizPoints: (points: number) => {
    load();
    set({ quizPoints: state.quizPoints + Math.max(0, Math.round(points)) });
  },
  markQuizAnswered: () => {
    load();
    if (!state.quizAnswered) set({ quizAnswered: true });
  },
  markPerfectQuiz: () => {
    load();
    if (!state.perfectQuiz) set({ perfectQuiz: true });
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
