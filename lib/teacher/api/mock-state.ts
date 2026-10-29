import { isObject, isText, isValidContent } from "../lessons";
import type { SchoolType } from "../store";
import type { Lesson, LessonDraft, Refinement, SourceKind } from "./types";

/**
 * What the mock adapter keeps in the browser. The demo school and its history are worked out from a
 * date (mock-data.ts), so only what the teacher changes is saved: the lessons made, copied, edited or
 * deleted, the drafts and sources being worked on, and a few settings. One overlay per demo school and per teacher
 * (the one with a season of history, and the one just invited). Who is signed in is not here: it is the session
 * (mock-session.ts), so resetting the demo does not sign anyone out.
 *
 * The saved text is read back with suspicion (it may come from an older build, another tab or a hand
 * edit): `sanitizeState` keeps every field that is well formed and falls back to the default for the
 * rest, so a bad save never crashes a screen.
 */

/** The key the mock saves under. Bump the number with `MOCK_VERSION` when the shape changes: the old save is then ignored. */
export const MOCK_KEY = "teacheraid-teacher-mock-v1";
export const MOCK_VERSION = 1;

/** A document or typed text the teacher gave, kept for the lesson that is made from it. */
export type DemoSource = { id: string; kind: SourceKind; file_name: string | null; text: string };

export type Overlay = {
  first_run_done: boolean;
  /** The speed bonus switch, by course id. */
  speed_bonus: Record<string, boolean>;
  /** Lessons made or changed in the demo, whole. A seeded lesson that was edited is here too and replaces the seeded one by id. */
  lessons: Lesson[];
  /** Seeded lessons the teacher deleted. */
  deleted: string[];
  drafts: LessonDraft[];
  sources: DemoSource[];
  /** Counts the ids handed out, so they never repeat. */
  counter: number;
};

/**
 * Who is signed in, in the demo: the teacher with a season of history, or one the admin has just invited, who has run nothing,
 * made no lesson and has not done the first run. Each has their own lessons, so one does not meet the other's work.
 */
export type Persona = "veteran" | "novice";
export const PERSONAS: readonly Persona[] = ["veteran", "novice"];

export type MockState = {
  v: typeof MOCK_VERSION;
  /** A local midnight: the demo's "today" when it was started or reset. */
  anchor: number;
  /** The teacher with history, in the secondary school and at the faculty. */
  school: Overlay;
  university: Overlay;
  /** The new teacher, in each. Kept apart so that a save made before there was one is still a good save. */
  novice: { school: Overlay; university: Overlay };
};

export const emptyOverlay = (persona: Persona = "veteran"): Overlay => ({
  first_run_done: persona === "veteran",
  speed_bonus: {},
  lessons: [],
  deleted: [],
  drafts: [],
  sources: [],
  counter: 0,
});

export const freshState = (anchor: number): MockState => ({
  v: MOCK_VERSION,
  anchor,
  school: emptyOverlay(),
  university: emptyOverlay(),
  novice: { school: emptyOverlay("novice"), university: emptyOverlay("novice") },
});

/** The local midnight at the start of the day `ms` falls on. */
export function startOfDay(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export const overlayOf = (state: MockState, type: SchoolType, persona: Persona = "veteran"): Overlay =>
  persona === "novice" ? state.novice[type] : type === "school" ? state.school : state.university;

export const withOverlay = (state: MockState, type: SchoolType, overlay: Overlay, persona: Persona = "veteran"): MockState =>
  persona === "novice"
    ? { ...state, novice: { ...state.novice, [type]: overlay } }
    : type === "school"
      ? { ...state, school: overlay }
      : { ...state, university: overlay };

// ---- Reading what was saved -----------------------------------------------------------------

const isCount = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0;

const REFINEMENTS: readonly Refinement[] = ["easier", "harder", "more_questions", "shorter_timers"];

const isSubject = (v: unknown) => isObject(v) && isText(v.id) && isText(v.name);

export function isLesson(v: unknown): v is Lesson {
  if (!isObject(v) || !isValidContent(v)) return false;
  const l: Record<string, unknown> = v;
  const copied = l.copied_from;
  const source = l.source;
  return (
    isText(l.id) &&
    isSubject(l.subject) &&
    isCount(l.year) &&
    isCount(l.version) &&
    l.version >= 1 &&
    l.question_count === (l.questions as unknown[]).length &&
    isCount(l.times_run) &&
    (l.last_run_at === null || isText(l.last_run_at)) &&
    (copied === null || (isObject(copied) && isText(copied.lesson_id) && isText(copied.owner_name))) &&
    isText(l.created_at) &&
    isText(l.updated_at) &&
    (l.emphasis === null || isText(l.emphasis)) &&
    (source === null ||
      (isObject(source) && isText(source.id) && (source.kind === "upload" || source.kind === "typed") && (source.file_name === null || isText(source.file_name))))
  );
}

export function isDraft(v: unknown): v is LessonDraft {
  if (!isObject(v) || !isValidContent(v)) return false;
  const d: Record<string, unknown> = v;
  return (
    isText(d.id) &&
    isText(d.source_id) &&
    isSubject(d.subject) &&
    isCount(d.year) &&
    (d.emphasis === null || isText(d.emphasis)) &&
    Array.isArray(d.refinements) &&
    d.refinements.every((r) => REFINEMENTS.includes(r as Refinement)) &&
    isText(d.created_at)
  );
}

const isSource = (v: unknown): v is DemoSource =>
  isObject(v) && isText(v.id) && (v.kind === "upload" || v.kind === "typed") && (v.file_name === null || isText(v.file_name)) && isText(v.text);

function sanitizeOverlay(saved: unknown, persona: Persona = "veteran"): Overlay {
  const s = isObject(saved) ? saved : {};
  const base = emptyOverlay(persona);
  return {
    first_run_done: typeof s.first_run_done === "boolean" ? s.first_run_done : base.first_run_done,
    speed_bonus: isObject(s.speed_bonus)
      ? Object.fromEntries(Object.entries(s.speed_bonus).filter((e): e is [string, boolean] => typeof e[1] === "boolean"))
      : base.speed_bonus,
    lessons: Array.isArray(s.lessons) ? s.lessons.filter(isLesson) : base.lessons,
    deleted: Array.isArray(s.deleted) ? s.deleted.filter(isText) : base.deleted,
    drafts: Array.isArray(s.drafts) ? s.drafts.filter(isDraft) : base.drafts,
    sources: Array.isArray(s.sources) ? s.sources.filter(isSource) : base.sources,
    counter: isCount(s.counter) ? s.counter : base.counter,
  };
}

/**
 * The state from whatever was saved. Anything that is not a save of this version starts a fresh demo as of `now`;
 * a save that is mostly good keeps its good parts.
 */
export function sanitizeState(saved: unknown, now: number): MockState {
  if (!isObject(saved) || saved.v !== MOCK_VERSION || typeof saved.anchor !== "number" || !Number.isFinite(saved.anchor) || saved.anchor > now + 2 * 86_400_000) {
    return freshState(startOfDay(now));
  }
  const novice = isObject(saved.novice) ? saved.novice : {};
  return {
    v: MOCK_VERSION,
    anchor: saved.anchor,
    school: sanitizeOverlay(saved.school),
    university: sanitizeOverlay(saved.university),
    novice: { school: sanitizeOverlay(novice.school, "novice"), university: sanitizeOverlay(novice.university, "novice") },
  };
}

type ReadableStorage = Pick<Storage, "getItem">;
type WritableStorage = Pick<Storage, "setItem">;

/** The saved state, or a fresh one when there is none, it cannot be read or it is not valid. Never throws. */
export function readState(storage: ReadableStorage | null, now: number): MockState {
  try {
    const raw = storage?.getItem(MOCK_KEY);
    if (raw) return sanitizeState(JSON.parse(raw), now);
  } catch {
    // Blocked storage or text that is not JSON: start fresh.
  }
  return freshState(startOfDay(now));
}

/** Save the state. A browser that refuses (private mode, full) just keeps the demo for as long as the page is open. */
export function writeState(storage: WritableStorage | null, state: MockState): void {
  try {
    storage?.setItem(MOCK_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}
