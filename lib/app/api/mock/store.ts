"use client";

import { useSyncExternalStore } from "react";
import { keepOnClear } from "../../keep-keys";
import { resetFocusNotice } from "../../session/focus-notice";
import { DEFAULT_PROFILE, isPhoto, type Profile } from "./avatars";
import { CLOCKS, demoTime, type ClockId } from "../../demo/schedule";
import { SUBJECTS, type SubjectId } from "./data";

/** `late`: the student joined after the lobby (attendance `late`, OPEN-05). */
export type Checkin = { id: string; subject: SubjectId; at: number; late?: boolean };

/** A live session the student finished, as the mock's results list keeps it. */
export type FinishedSession = {
  sessionId: string;
  courseId: SubjectId;
  lessonTitle: string;
  endedAt: number;
  right: number;
  total: number;
  questions: { id: string; prompt: string; correct: boolean; correctAnswer: string; yourAnswer: string | null }[];
};

/** A practice set the mock "teacher" sent after a lesson played in the demo (mock/practice.ts adds the ones the demo starts with). */
export type StoredPracticeSet = {
  id: string;
  sessionId: string;
  courseId: SubjectId;
  lessonTitle: string;
  createdAt: number;
  /** The ids of the lesson's questions in the set, in the lesson's order. */
  questionIds: string[];
};

export type AppState = {
  signedIn: boolean;
  /** Why the student is signed out, when it was not their own doing: another device signed in (BR-AUTH-03). */
  endedElsewhere: boolean;
  notificationsOn: boolean;
  read: string[];
  checkins: Checkin[];
  /** The display name and photo the student chose; null name means the school account's. */
  profile: Profile;
  /** Points earned in live quizzes, added to the class leaderboard (spec 13.1). */
  quizPoints: number;
  /** Whether the student has answered a question in a live quiz (the First answer achievement). */
  quizAnswered: boolean;
  /** Whether a whole live quiz was answered right, which unlocks the Perfect quiz achievement. */
  perfectQuiz: boolean;
  /** The time the demo runs on: the phone's clock, or a moment picked in Settings. */
  clock: ClockId;
  /** Live sessions played to the end, newest first: what the summary and Home's latest result show. */
  finished: FinishedSession[];
  /** Practice sets sent after the lessons played here, newest first. */
  practiceSets: StoredPracticeSet[];
  /** What the student answered in a practice set, by set and then question; the first answer stands. */
  practiceAnswers: Record<string, Record<string, string>>;
  /** When each practice set was finished. */
  practiceDone: Record<string, number>;
  /** The privacy notice the student last acknowledged and when (the server's `acknowledgement`); null until the first sign-in's notice. */
  noticeVersion: string | null;
  noticeAt: number | null;
  /** What the mock server has been sent besides answers, so "Your data" can count it: questions to the teacher, times away from the quiz. */
  asksSent: number;
  focusLost: number;
};

// Marked pure, so a live build that never reads the mock's data does not keep the mock because of this call.
const KEY = /* @__PURE__ */ keepOnClear("teacheraid-app-v1");

const DEFAULT: AppState = {
  // A phone that has never been used has to sign in, as a student's will.
  signedIn: false,
  endedElsewhere: false,
  notificationsOn: true,
  read: [],
  checkins: [],
  profile: DEFAULT_PROFILE,
  quizPoints: 0,
  quizAnswered: false,
  perfectQuiz: false,
  clock: "real",
  finished: [],
  practiceSets: [],
  practiceAnswers: {},
  practiceDone: {},
  noticeVersion: null,
  noticeAt: null,
  asksSent: 0,
  focusLost: 0,
};

const isCheckin = (c: unknown): c is Checkin => {
  const x = c as Partial<Checkin> | null;
  return !!x && typeof x.id === "string" && SUBJECTS.some((s) => s.id === x.subject) && Number.isFinite(x.at);
};

const isFinished = (f: unknown): f is FinishedSession => {
  const x = f as Partial<FinishedSession> | null;
  return (
    !!x &&
    typeof x.sessionId === "string" &&
    SUBJECTS.some((s) => s.id === x.courseId) &&
    typeof x.lessonTitle === "string" &&
    Number.isFinite(x.endedAt) &&
    Number.isFinite(x.right) &&
    Number.isFinite(x.total) &&
    Array.isArray(x.questions) &&
    x.questions.every((q) => !!q && typeof q.id === "string" && typeof q.prompt === "string" && typeof q.correct === "boolean" && typeof q.correctAnswer === "string")
  );
};

const isPracticeSet = (p: unknown): p is StoredPracticeSet => {
  const x = p as Partial<StoredPracticeSet> | null;
  return (
    !!x &&
    typeof x.id === "string" &&
    typeof x.sessionId === "string" &&
    SUBJECTS.some((s) => s.id === x.courseId) &&
    typeof x.lessonTitle === "string" &&
    Number.isFinite(x.createdAt) &&
    Array.isArray(x.questionIds) &&
    x.questionIds.every((q) => typeof q === "string")
  );
};

/** A record of strings by string, or of such records, kept only as far as it is well formed. */
function stringRecord(saved: unknown): Record<string, string> {
  if (!saved || typeof saved !== "object") return {};
  return Object.fromEntries(Object.entries(saved).filter((e): e is [string, string] => typeof e[1] === "string"));
}

/**
 * Rebuild the state field by field from whatever was saved. A save from an older build, or one
 * edited by hand, keeps its good fields and falls back to the defaults for the rest, so it can
 * never crash a screen.
 */
function sanitize(saved: unknown): AppState {
  const s = saved && typeof saved === "object" ? (saved as Record<string, unknown>) : {};
  return {
    signedIn: typeof s.signedIn === "boolean" ? s.signedIn : DEFAULT.signedIn,
    endedElsewhere: s.endedElsewhere === true && s.signedIn === false,
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
    finished: Array.isArray(s.finished) ? s.finished.filter(isFinished).slice(0, 20) : DEFAULT.finished,
    practiceSets: Array.isArray(s.practiceSets) ? s.practiceSets.filter(isPracticeSet).slice(0, 20) : DEFAULT.practiceSets,
    practiceAnswers:
      s.practiceAnswers && typeof s.practiceAnswers === "object"
        ? Object.fromEntries(Object.entries(s.practiceAnswers).map(([id, answers]) => [id, stringRecord(answers)]))
        : DEFAULT.practiceAnswers,
    practiceDone:
      s.practiceDone && typeof s.practiceDone === "object"
        ? Object.fromEntries(Object.entries(s.practiceDone).filter((e): e is [string, number] => typeof e[1] === "number" && Number.isFinite(e[1])))
        : DEFAULT.practiceDone,
    noticeVersion: typeof s.noticeVersion === "string" && s.noticeVersion ? s.noticeVersion : DEFAULT.noticeVersion,
    noticeAt: typeof s.noticeAt === "number" && Number.isFinite(s.noticeAt) ? s.noticeAt : DEFAULT.noticeAt,
    asksSent: count(s.asksSent),
    focusLost: count(s.focusLost),
  };
}

const count = (n: unknown) => (typeof n === "number" && Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0);

function sanitizeProfile(saved: unknown): Profile {
  const p = saved && typeof saved === "object" ? (saved as Record<string, unknown>) : {};
  const name = typeof p.name === "string" && p.name.trim() ? p.name.trim().slice(0, 40) : null;
  return { name, photo: isPhoto(p.photo) ? p.photo : null };
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

export function subscribeStore(cb: () => void) {
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

/** The saved state as it is now, for code that is not a component. */
export function getState(): AppState {
  load();
  return state;
}

/** What the server renders and the first hydrating render shows, before the saved state is read. */
export const DEFAULT_STATE: AppState = DEFAULT;

export function useApp(): AppState {
  return useSyncExternalStore(
    subscribeStore,
    () => {
      load();
      return state;
    },
    () => DEFAULT,
  );
}

export const actions = {
  signIn: () => set({ signedIn: true, endedElsewhere: false }),
  signOut: () => set({ signedIn: false, endedElsewhere: false }),
  /** The demo's stand-in for the same account signing in on another phone. */
  signOutElsewhere: () => set({ signedIn: false, endedElsewhere: true }),
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
  checkIn: (subject: SubjectId, late = false): Checkin => {
    load();
    const now = demoTime(state.clock, Date.now());
    const recent = state.checkins.find((c) => c.subject === subject && !!c.late === late && Math.abs(now - c.at) < 60 * 60 * 1000);
    if (recent) return recent;
    const entry: Checkin = { id: `c-${Date.now()}`, subject, at: now, ...(late && { late }) };
    set({ checkins: [entry, ...state.checkins] });
    return entry;
  },
  setProfile: (profile: Profile) => set({ profile }),
  /** POST /me/acknowledgements: the notice of this version was seen, now. `null` takes the acknowledgement back (the demo's "show the notice again"). */
  acknowledgeNotice: (version: string | null) => set({ noticeVersion: version, noticeAt: version === null ? null : Date.now() }),
  countAsk: () => {
    load();
    set({ asksSent: state.asksSent + 1 });
  },
  countFocusLost: (n: number) => {
    load();
    if (n > 0) set({ focusLost: state.focusLost + n });
  },
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
  finishSession: (record: FinishedSession) => {
    load();
    set({ finished: [record, ...state.finished.filter((f) => f.sessionId !== record.sessionId)].slice(0, 20) });
  },
  /** The mock teacher sends a practice set for a lesson (F-12). One per lesson: sending again does nothing. */
  addPracticeSet: (entry: StoredPracticeSet) => {
    load();
    if (state.practiceSets.some((p) => p.id === entry.id)) return;
    set({ practiceSets: [entry, ...state.practiceSets].slice(0, 20) });
  },
  /** Record the answers to a practice set, the points they earned, and when the set was finished (null: not yet). */
  answerPractice: (id: string, answers: Record<string, string>, points: number, doneAt: number | null) => {
    load();
    set({
      practiceAnswers: { ...state.practiceAnswers, [id]: { ...state.practiceAnswers[id], ...answers } },
      quizPoints: state.quizPoints + Math.max(0, Math.round(points)),
      ...(doneAt !== null && { practiceDone: { ...state.practiceDone, [id]: doneAt } }),
    });
  },
  reset: () => {
    load();
    for (const key of ["teacheraid-shown-attendance", "teacheraid-achievements-seen"]) {
      try {
        window.localStorage.removeItem(key);
      } catch {
        // ignore
      }
    }
    // The line about leaving the quiz is new again too.
    resetFocusNotice();
    // Starting the demo over is not signing out: whoever is in stays in, and a notice already seen stays seen.
    set({ ...DEFAULT, signedIn: state.signedIn, noticeVersion: state.noticeVersion, noticeAt: state.noticeAt });
  },
};
