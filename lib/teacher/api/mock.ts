import {
  EMPHASIS_MAX_CHARS,
  isDraftQuestion,
  isObject,
  isValidContent,
  LESSON_UPLOAD_EXTENSIONS,
  LESSON_UPLOAD_MAX_BYTES,
  TYPED_TEXT_MAX_CHARS,
  TYPED_TEXT_MIN_CHARS,
} from "../lessons";
import { browserImageEnv, checkImage, downscaleImage, UnreadableImage, type ImageEnv } from "../images";
import { tallyOf } from "../attendance";
import { NO_DEVICE_REASONS, nextState } from "../live";
import { missedOfQuestions, rankMissed } from "../review";
import { countMissed, QUESTIONS_MAX, selectPracticeQuestions } from "../scoring";
import type { SchoolType } from "../store";
import type { CallOptions, ChannelStatus, DemoControls, SettledPromise, TeacherApi, Unsubscribe } from "./client";
import { isProvider } from "../signin";
import { ApiError, toApiError, type ValidationReason } from "./errors";
import { BANK, bankLesson, bankQuestions, refineQuestions, type BankLesson } from "./mock-bank";
import {
  buildWorld,
  DAY_MS,
  libraryIdOf,
  lessonIdOf,
  studentPoints,
  type SeedCourse,
  type SeedSession,
  type World,
} from "./mock-data";
import { GENERATE_MS, latestUnsaved, REFINE_MS, startJob, statusOf, toSummary, toWire, trimDrafts } from "./mock-drafts";
import { classViewOf, consoleStudents, eventsBetween, hasJoinedAt, planClass, tokenAt, type SimInput } from "./mock-live";
import { anonQuestions, DEMO_NUDGE_AFTER_MS, nudgeAt, showQuestions, withQuestions, type PlayInput, type QuestionRun } from "./mock-questions";
import { adhocQuestion } from "./mock-adhoc";
import { endedFrom, practiceResultsAt } from "./mock-end";
import { demoProviderUrl, isOffline } from "./mock-session";
import { overlayOf, withOverlay, type DemoDraft, type DemoRun, type DemoSession, type EndedSession, type MockState, type Overlay, type Persona } from "./mock-state";
import type {
  AnonQuestionItem,
  AttendanceRow,
  AttendanceTally,
  ChannelEvent,
  ClassViewSnapshot,
  ConsoleSnapshot,
  CourseDashboard,
  CourseSummary,
  DashboardPractice,
  DashboardSession,
  DashboardTopic,
  DraftPatch,
  Id,
  Lesson,
  LessonContent,
  LessonSummary,
  LibraryItem,
  Me,
  MissedQuestion,
  NoDeviceRequest,
  OpenSession,
  PracticeResults,
  PracticeSetSummary,
  SessionReview,
  AdhocRequest,
  Question,
  SessionRef,
  TeacherChannel,
} from "./types";

/**
 * The mock adapter: the whole backend played in the browser over a demo school and what the teacher
 * has changed in it (mock-state.ts). It answers in the wire types, as the API would.
 *
 * Reads and quick changes return already-settled promises (see SettledPromise), so the hooks can show
 * the data in the render that asks for it. Writing a lesson takes a moment, as the AI does.
 *
 * Like the API, it answers `unauthenticated` to everything but signing in and out until somebody is signed in (`session()`),
 * and what it serves is that teacher's: Марија Петровска with a season of history, or a teacher who has just been invited
 * and has done nothing yet.
 *
 * What a real teacher cannot trigger, the demo can, so the screens' failure states can be tried:
 * a typed text or emphasis containing `[fail]` makes the AI fail, `[fail-once]` makes it fail the first time and work the
 * second (so a retry can be seen to help), `[slow]` makes it never answer (the draft stays pending until the limit of
 * `DRAFT_PENDING_MAX_SECONDS`, and then it has failed), `[stuck]` makes it never answer and never fail (a server that broke that
 * rule, for the page's own limit), and a document named like a scan (`scan` or `скен`) has no text in it.
 * A computer that is offline cannot reach it, as the real API cannot be reached.
 *
 * Writing a lesson is a job, as it is in the API (BR-LES-08): `generateLesson` answers at once with the draft pending, and the draft is
 * ready `GENERATE_MS` later by the clock (mock-drafts.ts), however the page was left or reloaded in the meantime.
 *
 * The live lesson (the console, the class view, realtime) is played from the clock alone (mock-live.ts): the class that joins, who is
 * late, who loses the connection and the code are worked out from when the lesson began and what time it is, so two windows agree and a
 * reload finds the lesson where it was. A teacher has one open lesson at a time; End (mock-end.ts) writes the register, keeps what the class missed and
 * what it wrote, and the lesson is then read from that record, with its practice set done over time by the same clock.
 */

/** What the mock reads and writes: the saved state, the demo school the app is on, the clock. */
export type MockSource = {
  state(): MockState;
  /** Replace the saved state. */
  commit(next: MockState): void;
  schoolType(): SchoolType;
  /** The signed-in teacher: the API's session cookie. Null when nobody is. */
  session(): Persona | null;
  /** Sign in as a teacher, or out with null. */
  setSession(next: Persona | null): void;
  now(): number;
  /** Called when the state or the school changes behind the adapter's back: another window, a reset, the demo switch. */
  subscribe(listener: () => void): Unsubscribe;
};

/** What only the mock can do, for the demo's Settings: show a lesson that is running. It is closed by End, like any other. */
export type MockDemo = Pick<DemoControls, "simulateRunning">;

/** A source that keeps everything in memory: the server render's, and the tests'. */
export function memorySource(
  initial: MockState,
  options: { schoolType?: SchoolType; now?: () => number; persona?: Persona | null } = {},
): MockSource & { setSchoolType(type: SchoolType): void } {
  let state = initial;
  let type = options.schoolType ?? "school";
  // The tests mostly want a teacher who is already in; the server render passes null: nobody is signed in there.
  let persona: Persona | null = options.persona === undefined ? "veteran" : options.persona;
  const listeners = new Set<() => void>();
  return {
    state: () => state,
    commit: (next) => {
      state = next;
    },
    schoolType: () => type,
    session: () => persona,
    setSession: (next) => {
      persona = next;
      listeners.forEach((l) => l());
    },
    now: options.now ?? Date.now,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setSchoolType: (next) => {
      type = next;
      listeners.forEach((l) => l());
    },
  };
}

const ok = <T>(value: T): SettledPromise<T> => {
  const p = Promise.resolve(value) as SettledPromise<T>;
  p.settled = { ok: true, value };
  return p;
};

const fail = <T>(error: ApiError): SettledPromise<T> => {
  const p = Promise.reject(error) as SettledPromise<T>;
  p.settled = { ok: false, error };
  p.catch(() => {}); // The hook reads `settled`; nothing else may call this a lost rejection.
  return p;
};

const run = <T>(fn: () => T): SettledPromise<T> => {
  try {
    return ok(fn());
  } catch (e) {
    return fail(toApiError(e));
  }
};

const iso = (ms: number) => new Date(ms).toISOString();
const notFound = () => new ApiError("not_found", { status: 404 });
const invalid = (reason?: ValidationReason) => new ApiError("validation_failed", { status: 422, reason });

/** Reading a document takes a moment, as it does on the server; typed sentences are taken at once, as the real API would. */
export const SOURCE_MS = 1500;
const MAX_SOURCES = 20;
/** Making a picture small takes a moment on the server too; long enough for the calm wait to be seen. */
export const MEDIA_MS = 1200;

type Ctx = { type: SchoolType; persona: Persona; state: MockState; overlay: Overlay; world: World; now: number };

/** A school as a teacher who has just been invited sees it: the same classes and rosters, and no lesson has ever been run. */
const withoutHistory = (world: World): World => ({ ...world, courses: world.courses.map((course) => ({ ...course, sessions: [] })) });

/** How the mock lets time pass. Tests give their own; the `signal` is how a screen stops waiting. */
export type Delay = (ms: number, signal?: AbortSignal) => Promise<void>;

/** A request the screen stopped waiting for fails as a dropped connection does. */
const dropped = (signal?: AbortSignal) => new ApiError("network", { cause: signal?.reason });

/** Wait `ms`, or fail the moment the screen stops waiting. */
const wait: Delay = (ms, signal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(dropped(signal));
    const stop = () => {
      clearTimeout(timer);
      reject(dropped(signal));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", stop);
      resolve();
    }, ms);
    signal?.addEventListener("abort", stop, { once: true });
  });

/**
 * What `PATCH /lessons/drafts/{id}` takes: the fields that changed, each of the shape it has. The API checks the shape and no more,
 * since a draft may be unfinished; the rules of a finished lesson are checked when it is saved.
 */
function isDraftPatch(v: unknown): v is DraftPatch {
  if (!isObject(v) || Object.keys(v).some((k) => k !== "title" && k !== "review_summary" && k !== "questions")) return false;
  if (v.title !== undefined && typeof v.title !== "string") return false;
  if (v.review_summary !== undefined && typeof v.review_summary !== "string") return false;
  if (v.questions !== undefined) {
    const q = v.questions;
    if (!Array.isArray(q) || q.length > QUESTIONS_MAX || !q.every(isDraftQuestion)) return false;
    if (new Set(q.map((x) => x.id)).size !== q.length) return false;
  }
  return true;
}

/** What a test may replace: how time passes, what the browser does with a picture, and what makes the realtime stream look again. */
export type MockOptions = {
  delay?: Delay;
  image?: ImageEnv;
  tick?: (look: () => void) => Unsubscribe;
  /** How long a lesson may go without a question before the console's nudge (FR-POP-06). The demo's is short, so that it can be seen. */
  nudgeAfterMs?: number;
};

/** The stream looks again at the lesson once a second: that is how quickly a join or a code that changed reaches a screen. */
const everySecond = (look: () => void): Unsubscribe => {
  const handle = setInterval(look, 1000);
  return () => clearInterval(handle);
};

/** The adapter alone, for the tests and the server render. */
export const createMockApi = (source: MockSource, options: MockOptions = {}): TeacherApi => createMock(source, options).api;

export function createMock(source: MockSource, options: MockOptions = {}): { api: TeacherApi; demo: MockDemo } {
  const delay = options.delay ?? wait;
  const image = options.image ?? browserImageEnv;
  const tick = options.tick ?? everySecond;
  const nudgeAfterMs = options.nudgeAfterMs ?? DEMO_NUDGE_AFTER_MS;

  const ctx = (): Ctx => {
    const type = source.schoolType();
    const state = source.state();
    // Every call but signing in and out is refused before it gets here when nobody is signed in (see `guarded`).
    const persona = source.session() ?? "veteran";
    const world = buildWorld(type, state.anchor);
    return {
      type,
      persona,
      state,
      overlay: overlayOf(state, type, persona),
      world: persona === "novice" ? withoutHistory(world) : world,
      now: source.now(),
    };
  };
  /** Save a changed overlay. */
  const save = (c: Ctx, overlay: Overlay) => source.commit(withOverlay(c.state, c.type, overlay, c.persona));

  // ---- The teacher's lessons ----

  /** The lessons of the school's history and the two prepared ones, as they were before the teacher changed anything. */
  const seededLessons = (c: Ctx): Lesson[] => {
    // A teacher who has just been invited has made no lesson: the two prepared ones and the six run are Марија's.
    if (c.persona === "novice") return [];
    const { def, anchor, courses } = c.world;
    const keys: { key: string; course: SeedCourse; prepared: boolean }[] = [];
    for (const course of courses) {
      for (const key of course.def.lessons) if (!keys.some((k) => k.key === key)) keys.push({ key, course, prepared: false });
    }
    def.prepared.forEach((p) => keys.push({ key: p.key, course: courses[p.classIndex], prepared: true }));

    return keys.map(({ key, course, prepared }, i) => {
      const bank = bankLesson(key);
      const id = lessonIdOf(key);
      const first = course.sessions.find((s) => s.lesson_key === key);
      const created = (first ? first.started_at : anchor) - (prepared ? (i % 3) * DAY_MS + DAY_MS : 3 * DAY_MS);
      const questions = bankQuestions(bank, id);
      return {
        id,
        title: bank.title,
        subject: course.def.subject,
        year: course.def.year,
        question_count: questions.length,
        version: 1,
        times_run: 0,
        last_run_at: null,
        last_session_id: null,
        copied_from: null,
        created_at: iso(created),
        updated_at: iso(created),
        review_summary: bank.summary,
        questions,
        source: { id: `src-${key}`, kind: i % 2 === 0 ? "upload" : "typed", file_name: i % 2 === 0 ? `${bank.title}.docx` : null },
        emphasis: null,
      };
    });
  };

  /** How often and when a lesson was run, from the history and from the lessons ended in the demo, and the latest of them for the way back to its end page. */
  const withRuns = (c: Ctx, lesson: Lesson): Lesson => {
    const runs = [
      ...c.world.courses.flatMap((course) => course.sessions).filter((s) => s.lesson_id === lesson.id).map((s) => ({ id: s.id, at: s.ended_at })),
      ...c.overlay.ended.filter((e) => e.lesson.id === lesson.id).map((e) => ({ id: e.id, at: Date.parse(e.ended_at) })),
    ];
    const latest = runs.reduce<(typeof runs)[number] | null>((best, r) => (best === null || r.at >= best.at ? r : best), null);
    return { ...lesson, times_run: runs.length, last_run_at: latest ? iso(latest.at) : null, last_session_id: latest ? latest.id : null };
  };

  const lessonsOf = (c: Ctx): Lesson[] => {
    const changed = new Set(c.overlay.lessons.map((l) => l.id));
    const kept = seededLessons(c).filter((l) => !c.overlay.deleted.includes(l.id) && !changed.has(l.id));
    return [...kept, ...c.overlay.lessons].map((l) => withRuns(c, l)).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  };

  const summary = (l: Lesson): LessonSummary => ({
    id: l.id,
    title: l.title,
    subject: l.subject,
    year: l.year,
    question_count: l.question_count,
    version: l.version,
    times_run: l.times_run,
    last_run_at: l.last_run_at,
    last_session_id: l.last_session_id,
    copied_from: l.copied_from,
    created_at: l.created_at,
    updated_at: l.updated_at,
  });

  // ---- The school library ----

  const libraryLesson = (c: Ctx, key: string): Lesson => {
    const { def, anchor } = c.world;
    const entry = def.library.find((l) => l.key === key)!;
    const bank = bankLesson(key);
    const id = libraryIdOf(key);
    const saved = iso(anchor - entry.daysAgo * DAY_MS);
    const questions = bankQuestions(bank, id);
    return {
      id,
      title: bank.title,
      subject: entry.subject,
      year: bank.year,
      question_count: questions.length,
      version: 1,
      times_run: 0,
      last_run_at: null,
      last_session_id: null,
      copied_from: null,
      created_at: saved,
      updated_at: saved,
      review_summary: bank.summary,
      questions,
      source: null,
      emphasis: null,
    };
  };

  /** The lessons colleagues saved: those of the demo school, or none in a school where nobody has saved one yet. */
  const libraryEntries = (c: Ctx) => (c.overlay.library_empty ? [] : c.world.def.library);

  const libraryOf = (c: Ctx): LibraryItem[] => {
    const copied = new Set(lessonsOf(c).map((l) => l.copied_from?.lesson_id));
    return libraryEntries(c).map((entry) => {
      const lesson = libraryLesson(c, entry.key);
      return {
        lesson_id: lesson.id,
        title: lesson.title,
        subject: lesson.subject,
        year: lesson.year,
        question_count: lesson.question_count,
        owner: c.world.def.colleagues[entry.colleague],
        saved_at: lesson.created_at,
        already_copied: copied.has(lesson.id),
      };
    });
  };

  // ---- Courses and the dashboard ----

  const courseSummary = (c: Ctx, course: SeedCourse): CourseSummary => {
    const finished = [...course.sessions.map((s) => s.ended_at), ...c.overlay.ended.filter((e) => e.course_id === course.course_id).map((e) => Date.parse(e.ended_at))];
    const last = finished.length ? Math.max(...finished) : null;
    return {
      id: course.course_id,
      subject: course.def.subject,
      class: { id: course.class_id, name: course.def.name, year: course.def.year },
      student_count: course.students.length,
      speed_bonus_on: c.overlay.speed_bonus[course.course_id] ?? true,
      lessons_run: finished.length,
      last_session_at: last === null ? null : iso(last),
    };
  };

  const findCourse = (c: Ctx, courseId: Id): SeedCourse => {
    const course = c.world.courses.find((x) => x.course_id === courseId);
    if (!course) throw notFound();
    return course;
  };

  const tally = (session: SeedSession): AttendanceTally => {
    const t: AttendanceTally = { present: 0, late: 0, absent: 0, present_no_device: 0, total: session.marks.length };
    for (const m of session.marks) t[m.status]++;
    return t;
  };

  /** Pairs of (student, question) where the student had joined before the question opened, and what came of them. */
  const opportunities = (session: SeedSession) => {
    const joinedAt = new Map(session.marks.filter((m) => m.status === "present" || m.status === "late").map((m) => [m.student_id, m.joined_at ?? 0]));
    const given = new Map(session.answers.map((a) => [`${a.student_id}/${a.question_id}`, a]));
    const pairs: { student_id: string; topic: string; answered: boolean; correct: boolean }[] = [];
    for (const sq of session.questions) {
      if (sq.skipped) continue;
      for (const [student_id, at] of joinedAt) {
        if (at > sq.fired_at) continue;
        const answer = given.get(`${student_id}/${sq.id}`);
        pairs.push({ student_id, topic: sq.question.topic, answered: !!answer, correct: !!answer?.correct });
      }
    }
    return pairs;
  };

  const dashboardSession = (session: SeedSession): DashboardSession => {
    const pairs = opportunities(session);
    const answered = pairs.filter((p) => p.answered).length;
    return {
      id: session.id,
      lesson: { id: session.lesson_id, title: session.lesson_title, version: 1 },
      started_at: iso(session.started_at),
      ended_at: iso(session.ended_at),
      question_count: session.questions.filter((q) => !q.skipped).length,
      tally: tally(session),
      participation: pairs.length ? Math.round((answered / pairs.length) * 100) / 100 : 0,
      right_rate: answered ? Math.round((pairs.filter((p) => p.correct).length / answered) * 100) / 100 : 0,
      points: session.answers.reduce((sum, a) => sum + a.points, 0),
    };
  };

  const dashboardTopics = (course: SeedCourse): DashboardTopic[] => {
    const topics = new Map<string, { right: number; total: number; by: Map<string, { right: number; total: number }> }>();
    for (const session of course.sessions) {
      for (const p of opportunities(session)) {
        const t = topics.get(p.topic) ?? { right: 0, total: 0, by: new Map() };
        const s = t.by.get(p.student_id) ?? { right: 0, total: 0 };
        t.total++;
        s.total++;
        if (p.correct) {
          t.right++;
          s.right++;
        }
        t.by.set(p.student_id, s);
        topics.set(p.topic, t);
      }
    }
    return [...topics].map(([topic, t]) => ({
      topic,
      right: t.right,
      total: t.total,
      by_student: [...t.by].map(([student_id, v]) => ({ student_id, ...v })),
    }));
  };

  const practiceSummary = (course: SeedCourse, session: SeedSession, p: NonNullable<SeedSession["practice"]>): PracticeSetSummary => ({
    id: p.id,
    session_id: session.id,
    course_id: course.course_id,
    created_at: iso(p.created_at),
    question_count: p.question_ids.length,
  });

  const dashboardPractice = (course: SeedCourse, session: SeedSession): DashboardPractice | null => {
    const p = session.practice;
    if (!p) return null;
    const done = p.results.filter((r) => r.completed_at !== null && r.score !== null);
    return {
      practice_set: practiceSummary(course, session, p),
      students: p.results.length,
      completed: done.length,
      average_score: done.length ? Math.round((done.reduce((sum, r) => sum + (r.score ?? 0), 0) / done.length) * 10) / 10 : null,
    };
  };

  /** A lesson ended in the demo, as the course's history lists it. */
  const frozenSession = (e: EndedSession): DashboardSession => ({
    id: e.id,
    lesson: e.lesson,
    started_at: e.started_at,
    ended_at: e.ended_at,
    question_count: e.results.question_count,
    tally: tallyOf(e.attendance),
    participation: e.results.participation,
    right_rate: e.results.right_rate,
    points: e.results.points,
  });

  const frozenPractice = (c: Ctx, course: SeedCourse, e: EndedSession): DashboardPractice | null => {
    const record = c.overlay.practice[e.id];
    if (!record) return null;
    const done = practiceResultsAt(record, e.attendance, c.now).filter((r) => r.completed_at !== null && r.score !== null);
    return {
      practice_set: { id: record.id, session_id: e.id, course_id: course.course_id, created_at: record.created_at, question_count: record.question_ids.length },
      students: e.attendance.length,
      completed: done.length,
      average_score: done.length ? Math.round((done.reduce((sum, r) => sum + (r.score ?? 0), 0) / done.length) * 10) / 10 : null,
    };
  };

  /** The class's topics, the seeded lessons' and those ended in the demo added up. The demo does not keep who answered what in a lesson it ended. */
  const withFrozenTopics = (seeded: DashboardTopic[], frozen: EndedSession[]): DashboardTopic[] => {
    const all = new Map(seeded.map((t) => [t.topic, { ...t }]));
    for (const e of frozen) {
      for (const t of e.results.topics) {
        const have = all.get(t.topic) ?? { topic: t.topic, right: 0, total: 0, by_student: [] };
        all.set(t.topic, { ...have, right: have.right + t.right, total: have.total + t.total });
      }
    }
    return [...all.values()];
  };

  const dashboardOf = (c: Ctx, course: SeedCourse): CourseDashboard => {
    const names = new Map(course.students.map((s) => [s.id, s.full_name]));
    const newestFirst = [...course.sessions].reverse();
    const frozen = c.overlay.ended.filter((e) => e.course_id === course.course_id).reverse();
    return {
      server_now: iso(c.now),
      course: courseSummary(c, course),
      students: course.students.map((s) => ({
        id: s.id,
        full_name: s.full_name,
        joined_mid_year: s.joined_class_at !== null,
        joined_class_at: s.joined_class_at === null ? null : iso(s.joined_class_at),
        points: studentPoints(course, s.id),
      })),
      sessions: [...frozen.map(frozenSession), ...newestFirst.map(dashboardSession)],
      attendance: [
        ...course.sessions.flatMap((s) => s.marks.map((m) => ({ session_id: s.id, student_id: m.student_id, status: m.status, no_device_reason: m.reason }))),
        ...frozen.flatMap((e) => e.attendance.map((a) => ({ session_id: e.id, student_id: a.student_id, status: a.status, no_device_reason: a.no_device_reason }))),
      ],
      topics: withFrozenTopics(dashboardTopics(course), frozen),
      focus_flags: [
        ...frozen.flatMap((e) =>
          e.results.focus.map((f) => ({
            ...f,
            session_id: e.id,
            away_seconds: f.back_at === null ? null : Math.round((Date.parse(f.back_at) - Date.parse(f.lost_at)) / 1000),
          })),
        ),
        ...newestFirst.flatMap((s) =>
          s.focus.map((f) => ({
            student_id: f.student_id,
            session_question_id: f.question_id,
            lost_at: iso(f.lost_at),
            back_at: iso(f.back_at),
            session_id: s.id,
            away_seconds: Math.round((f.back_at - f.lost_at) / 1000),
          })),
        ),
      ],
      anon_questions: [
        ...frozen.flatMap((e) => e.anon_questions.map((a) => ({ ...a, session_id: e.id }))),
        ...newestFirst.flatMap((s) =>
          s.anon.map((a) => ({
            id: a.id,
            text: a.text,
            sender: { id: a.sender_id, name: names.get(a.sender_id) ?? "" },
            created_at: iso(a.created_at),
            answered_at: a.answered_at === null ? null : iso(a.answered_at),
            session_id: s.id,
          })),
        ),
      ],
      practice: [
        ...frozen.map((e) => frozenPractice(c, course, e)),
        ...newestFirst.map((s) => dashboardPractice(course, s)),
      ].filter((p): p is DashboardPractice => p !== null),
    };
  };

  // ---- Making a lesson ----

  /** The demo "writes" a lesson by choosing the bank lesson whose words appear in what the teacher gave. */
  const chooseBank = (words: string, year: number): BankLesson => {
    const text = words.toLowerCase();
    let best: BankLesson | null = null;
    let bestHits = 0;
    for (const bank of BANK) {
      // How often the lesson's words come up: a word used again and again says more than one used once.
      const hits = bank.keywords.reduce((n, k) => n + (text.split(k).length - 1), 0);
      if (hits > bestHits) {
        best = bank;
        bestHits = hits;
      }
    }
    if (best) return best;
    const byYear = BANK.filter((b) => b.year === year);
    return byYear.length ? byYear[Math.abs(text.length) % byYear.length] : BANK[0];
  };

  const nextId = (overlay: Overlay, prefix: string) => `${prefix}${overlay.counter + 1}`;

  const toLesson = (id: string, content: LessonContent, base: Omit<Lesson, keyof LessonContent | "id" | "question_count">): Lesson => ({
    ...base,
    id,
    title: content.title.trim(),
    review_summary: content.review_summary,
    questions: content.questions.map((q, i) => ({ ...q, id: `${id}-q${i + 1}`, order: i }) as Question),
    question_count: content.questions.length,
  });

  // ---- The open lesson ----

  const sessionRef = (s: DemoSession): SessionRef => ({
    id: s.id,
    course_id: s.course_id,
    lesson: s.lesson,
    state: s.state,
    started_at: s.started_at,
    ended_at: null,
  });

  /** The open lesson with the names of its class and subject; none when there is none, or its course is not in this school. */
  const openOf = (c: Ctx): OpenSession["session"] => {
    const s = c.overlay.session;
    const course = s && c.world.courses.find((x) => x.course_id === s.course_id);
    return s && course ? { ...sessionRef(s), class_name: course.def.name, subject_name: course.def.subject.name } : null;
  };

  /** The lesson of the open session, as it is asked about: the open session of this teacher, whose course is in this school, else `not_found`. */
  const liveOf = (sessionId: Id) => {
    const c = ctx();
    const s = c.overlay.session;
    const course = s && s.id === sessionId ? c.world.courses.find((x) => x.course_id === s.course_id) : undefined;
    if (!s || !course) throw notFound();
    return { c, s, course };
  };

  const simInput = (c: Ctx, s: DemoSession): SimInput => ({
    started_at: Date.parse(s.started_at),
    teaching_at: s.teaching_at === null ? null : Date.parse(s.teaching_at),
    now: c.now,
  });

  const planOf = (s: DemoSession, course: SeedCourse) => planClass(s.id, course.students.map((student) => student.id));

  /**
   * What the console shows of a lesson, at the moment of the question: every question ready, and the class as the clock has it (who has
   * joined, who is late, who has lost the connection, who is marked present without a phone) with the code of this 30-second window.
   */
  const consoleOf = (c: Ctx, s: DemoSession, course: SeedCourse): ConsoleSnapshot => {
    const input = simInput(c, s);
    const plans = planOf(s, course);
    const runs = runsOf(c, s);
    const play: PlayInput = { sessionId: s.id, roster: course.students, plans, sim: input, speedBonusOn: c.overlay.speed_bonus[course.course_id] ?? true };
    const shown = showQuestions(runs, play, c.now);
    const answered = Object.fromEntries(Object.entries(s.anon_answered));
    const snapshot: ConsoleSnapshot = {
      server_now: iso(c.now),
      session: { ...sessionRef(s), class_name: course.def.name, subject_name: course.def.subject.name },
      join: s.state === "ended" ? null : tokenAt(s.id, c.now),
      questions: shown.questions,
      students: withQuestions(consoleStudents(course.students, plans, s.marks, input), shown, c.now),
      anon_questions: anonQuestions(s.id, course.students, plans, input, answered, c.now),
      focus_flags: shown.flags,
      board: shown.board,
      nudge: null,
    };
    return { ...snapshot, nudge: nudgeAt(snapshot, input.teaching_at, c.now, nudgeAfterMs) };
  };

  /** The lesson's questions in the order they are sent, then the quick ones in the order they were made, each with what the teacher did with it. */
  const runsOf = (c: Ctx, s: DemoSession): QuestionRun[] => {
    const lesson = lessonsOf(c).find((l) => l.id === s.lesson.id);
    // A teacher who has made no lesson yet is shown one of the demo's own (simulateRunning), whose questions come from the bank.
    const prepared = lesson ? lesson.questions : bankQuestions(bankLesson("procenti"), s.lesson.id);
    const ms = (v: string | null | undefined) => (v ? Date.parse(v) : null);
    const make = (id: string, question: Question, adhoc: boolean): QuestionRun => {
      const done = s.runs.find((r) => r.id === id);
      return { id, question, adhoc, fired_at: ms(done?.fired_at), skipped_at: ms(done?.skipped_at), revealed_at: ms(done?.revealed_at) };
    };
    return [...prepared.map((q, i) => make(`${s.id}-sq${i + 1}`, q, false)), ...s.adhoc.map((q, i) => make(`${s.id}-aq${i + 1}`, q, true))];
  };

  /** Change what the teacher did with a question; the question is saved as touched. */
  const touch = (s: DemoSession, id: string, change: Partial<Omit<DemoRun, "id">>): DemoSession => {
    const old = s.runs.find((r) => r.id === id) ?? { id, fired_at: null, skipped_at: null, revealed_at: null };
    return { ...s, runs: [...s.runs.filter((r) => r.id !== id), { ...old, ...change }] };
  };

  /** A question of this lesson and what it is doing now, or `not_found`. */
  const questionOf = (c: Ctx, s: DemoSession, course: SeedCourse, sqId: Id) => {
    const q = consoleOf(c, s, course).questions.find((x) => x.id === sqId);
    if (!q) throw notFound();
    return q;
  };

  // ---- Lessons that have ended ----

  /**
   * A lesson that has ended, as the review, the end page and the practice set read it: one the teacher ended in the demo (frozen when End was pressed), or one of
   * the school's history. `practice` is the set that was sent for it, with who has done it at `now`, or null when none was sent.
   */
  type EndedView = {
    session: SessionRef;
    class_name: string;
    subject_name: string;
    attendance: AttendanceRow[];
    most_missed: MissedQuestion[];
    anon_questions: AnonQuestionItem[];
    practice: ((now: number) => PracticeResults) | null;
    course: SeedCourse;
  };

  const endedRef = (e: { id: string; course_id: string; lesson: SessionRef["lesson"]; started_at: string; ended_at: string }): SessionRef => ({
    id: e.id,
    course_id: e.course_id,
    lesson: e.lesson,
    state: "ended",
    started_at: e.started_at,
    ended_at: e.ended_at,
  });

  const endedOf = (c: Ctx, sessionId: Id): EndedView | null => {
    const frozen = c.overlay.ended.find((e) => e.id === sessionId);
    if (frozen) {
      const course = c.world.courses.find((x) => x.course_id === frozen.course_id);
      if (!course) return null;
      const session = endedRef(frozen);
      const record = c.overlay.practice[sessionId];
      return {
        session,
        class_name: course.def.name,
        subject_name: course.def.subject.name,
        attendance: frozen.attendance,
        most_missed: frozen.most_missed,
        anon_questions: frozen.anon_questions,
        practice: record
          ? (now) => ({
              practice_set: { id: record.id, session_id: sessionId, course_id: course.course_id, created_at: record.created_at, question_count: record.question_ids.length },
              students: practiceResultsAt(record, frozen.attendance, now),
            })
          : null,
        course,
      };
    }
    for (const course of c.world.courses) {
      const seeded = course.sessions.find((x) => x.id === sessionId);
      if (!seeded) continue;
      const names = new Map(course.students.map((st) => [st.id, st.full_name]));
      const attendance: AttendanceRow[] = seeded.marks.map((m) => ({
        student_id: m.student_id,
        full_name: names.get(m.student_id) ?? "",
        status: m.status,
        joined_at: m.joined_at === null ? null : iso(m.joined_at),
        no_device_reason: m.reason,
        marked_by: m.marked_by,
      }));
      const right = new Set(seeded.answers.filter((a) => a.correct).map((a) => `${a.student_id}/${a.question_id}`));
      const missed = seeded.questions
        .map((sq, order): MissedQuestion | null => {
          if (sq.skipped) return null;
          const { missed: wrong, joined } = countMissed(sq.fired_at, seeded.marks.map((m) => ({ joined_at: m.joined_at, right: right.has(`${m.student_id}/${sq.id}`) })));
          const q = sq.question;
          return {
            session_question_id: sq.id,
            order,
            prompt: q.prompt,
            kind: q.kind,
            topic: q.topic.trim() || seeded.lesson_title,
            missed: wrong,
            joined,
            correct_answer: q.correct,
            explanation: q.explanation,
            options: q.kind === "multiple_choice" ? q.options : null,
            unit: q.kind === "numeric" ? q.unit : null,
          };
        })
        .filter((m): m is MissedQuestion => m !== null);
      const p = seeded.practice;
      const record = c.overlay.practice[sessionId];
      return {
        session: endedRef({ id: seeded.id, course_id: seeded.course_id, lesson: { id: seeded.lesson_id, title: seeded.lesson_title, version: 1 }, started_at: iso(seeded.started_at), ended_at: iso(seeded.ended_at) }),
        class_name: course.def.name,
        subject_name: course.def.subject.name,
        attendance,
        most_missed: rankMissed(missed),
        anon_questions: seeded.anon.map((a) => ({
          id: a.id,
          text: a.text,
          sender: { id: a.sender_id, name: names.get(a.sender_id) ?? "" },
          created_at: iso(a.created_at),
          answered_at: a.answered_at === null ? null : iso(a.answered_at),
        })),
        practice: p
          ? () => ({
              practice_set: practiceSummary(course, seeded, p),
              students: p.results.map((r) => ({ student_id: r.student_id, full_name: names.get(r.student_id) ?? "", score: r.score, completed_at: r.completed_at === null ? null : iso(r.completed_at) })),
            })
          : record
            ? (now) => ({
                practice_set: { id: record.id, session_id: sessionId, course_id: course.course_id, created_at: record.created_at, question_count: record.question_ids.length },
                students: practiceResultsAt(record, attendance, now),
              })
            : null,
        course,
      };
    }
    return null;
  };

  /** The projector's snapshot of a lesson that has ended: it says the lesson is over and holds nothing a name could leak through. */
  const endedClassView = (c: Ctx, e: EndedView): ClassViewSnapshot => ({
    server_now: iso(c.now),
    session: {
      id: e.session.id,
      state: "ended",
      lesson_title: e.session.lesson.title,
      class_name: e.class_name,
      subject_name: e.subject_name,
      joined_count: e.attendance.filter((a) => a.status === "present" || a.status === "late").length,
      recent: [],
    },
    join: null,
    question: null,
    progress: null,
    reveal: null,
    skipped: false,
    board: [],
    review: null,
  });

  /** The stream of a lesson: what changed since it last looked (mock-live.ts), as often as the tick, and at once when another window changed it. */
  const stream = (channel: TeacherChannel, sessionId: Id, onEvent: (e: ChannelEvent) => void, onStatus?: (s: ChannelStatus) => void): Unsubscribe => {
    let previous: ConsoleSnapshot | null = null;
    let status: ChannelStatus = "connecting";
    let stopped = false;
    const say = (next: ChannelStatus) => {
      if (next === status) return;
      status = next;
      onStatus?.(next);
    };
    const read = (): ConsoleSnapshot | null => {
      try {
        const { c, s, course } = liveOf(sessionId);
        return consoleOf(c, s, course);
      } catch {
        return null;
      }
    };
    const look = () => {
      if (stopped) return;
      // A computer with no connection cannot reach the lesson, in the mock as for real: it says so, and opens again on its own.
      if (isOffline()) {
        previous = null;
        say("reconnecting");
        return;
      }
      const next = read();
      if (status !== "open") {
        previous = next;
        say("open");
        return;
      }
      if (next && previous) for (const event of eventsBetween(previous, next, channel)) onEvent(event);
      // The lesson was open and is not any more: it ended (here or in another window), and the screens that were showing it are told once.
      else if (!next && previous && endedOf(ctx(), sessionId)) onEvent({ type: "state.changed", state: "ended", channel, server_now: iso(source.now()) });
      previous = next;
    };
    onStatus?.("connecting");
    const stopTick = tick(look);
    const stopListening = source.subscribe(look);
    if (typeof window !== "undefined") {
      window.addEventListener("online", look);
      window.addEventListener("offline", look);
    }
    queueMicrotask(look);
    return () => {
      stopped = true;
      stopTick();
      stopListening();
      if (typeof window !== "undefined") {
        window.removeEventListener("online", look);
        window.removeEventListener("offline", look);
      }
    };
  };

  const findDraft = (c: Ctx, draftId: Id): DemoDraft => {
    const draft = c.overlay.drafts.find((d) => d.id === draftId);
    if (!draft) throw notFound();
    return draft;
  };

  const api: TeacherApi = {
    // The redirect to the provider is, in the demo, the sign-in screen with a sheet that stands in for the provider's page.
    startSignIn: (request) =>
      run(() => {
        if (isOffline()) throw new ApiError("network");
        if (!isProvider(request?.provider)) throw invalid();
        return { method: "redirect" as const, url: demoProviderUrl(request.provider, request.return_to) };
      }),
    signOut: () =>
      run(() => {
        // A sign-out that cannot reach the server leaves the teacher signed in, and says so (EC-AUTH-08).
        if (isOffline()) throw new ApiError("network");
        // With no session left there is nothing to end, and that is not a failure either: the call is let through.
        source.setSession(null);
      }),

    getMe: () =>
      run(() => {
        const c = ctx();
        const { school } = c.world.def;
        const teacher = c.persona === "novice" ? c.world.def.novice : c.world.def.teacher;
        const me: Me = {
          id: teacher.id,
          name: teacher.name,
          email: teacher.email,
          role: "teacher",
          auth_provider: teacher.provider,
          first_run_done: c.overlay.first_run_done,
          school: { id: school.id, name: school.name, type: school.kind },
        };
        return me;
      }),
    setFirstRunDone: () => {
      // A change needs the server: offline, it is not kept, and the guide says so.
      if (isOffline()) return fail(new ApiError("network"));
      const c = ctx();
      save(c, { ...c.overlay, first_run_done: true });
      return api.getMe();
    },

    listCourses: () =>
      run(() => {
        const c = ctx();
        return c.overlay.courses_empty ? [] : c.world.courses.map((course) => courseSummary(c, course));
      }),
    getDashboard: (courseId) => {
      const read = () => run(() => {
        const c = ctx();
        if (c.overlay.courses_empty) throw notFound();
        return dashboardOf(c, findCourse(c, courseId));
      });
      const { dashboard_wait_ms: wait, dashboard_failures: failures } = ctx().overlay;
      if (wait === 0 && failures === 0) return read();
      // A slow or failing server, for a test or a screenshot: a read that waits, and one that fails a set number of times.
      return (async () => {
        if (wait > 0) await delay(wait);
        const c = ctx();
        if (c.overlay.dashboard_failures > 0) {
          save(c, { ...c.overlay, dashboard_failures: c.overlay.dashboard_failures - 1 });
          throw new ApiError("network");
        }
        return read();
      })();
    },
    updateCourse: (courseId, patch) =>
      run(() => {
        const c = ctx();
        const course = findCourse(c, courseId);
        if (typeof patch?.speed_bonus_on !== "boolean") throw invalid();
        save(c, { ...c.overlay, speed_bonus: { ...c.overlay.speed_bonus, [courseId]: patch.speed_bonus_on } });
        return courseSummary(ctx(), course);
      }),

    createSource: async (input, { signal }: CallOptions = {}) => {
      if (isOffline()) throw new ApiError("network");
      // A document is read on the server, which takes a moment; typed sentences are taken at once.
      if (input.kind === "upload") {
        await delay(SOURCE_MS, signal);
        if (isOffline()) throw new ApiError("network");
      }
      const c = ctx();
      let record;
      if (input.kind === "typed") {
        // Counted in characters after the spaces at both ends are cut (BR-LES-06, BR-LES-14).
        const text = input.text.trim();
        if (text.length < TYPED_TEXT_MIN_CHARS) throw invalid("text_too_short");
        if (text.length > TYPED_TEXT_MAX_CHARS) throw invalid("text_too_long");
        record = { id: nextId(c.overlay, "src-n"), kind: "typed" as const, file_name: null, text: text.slice(0, 4000), runs: 0 };
      } else {
        const { file } = input;
        const name = file.name.toLowerCase();
        if (!LESSON_UPLOAD_EXTENSIONS.some((ext) => name.endsWith(ext))) throw invalid("file_type");
        if (file.size === 0) throw invalid("empty");
        if (file.size > LESSON_UPLOAD_MAX_BYTES) throw invalid("file_too_large");
        // A scan is a picture of a page: there is no text to read (BR-LES-05).
        if (/scan|скен/i.test(name)) throw invalid("no_text");
        record = { id: nextId(c.overlay, "src-n"), kind: "upload" as const, file_name: file.name, text: file.name, runs: 0 };
      }
      save(c, { ...c.overlay, counter: c.overlay.counter + 1, sources: [...c.overlay.sources, record].slice(-MAX_SOURCES) });
      return { source_id: record.id };
    },

    // ---- Writing a lesson is a job (BR-LES-08) ----
    generateLesson: (request) =>
      run(() => {
        if (isOffline()) throw new ApiError("network");
        const c = ctx();
        const found = c.overlay.sources.find((s) => s.id === request.source_id);
        if (!found) throw notFound();
        const subject = c.world.courses.map((course) => course.def.subject).find((s) => s.id === request.subject_id);
        if (!subject || !Number.isInteger(request.year) || request.year < 1 || request.year > 6) throw invalid();
        // One generation of a source at a time: a double press is answered with the draft already being written (BR-LES-10).
        const running = c.overlay.drafts.find((d) => d.source_id === found.id && d.consumed_at === null && statusOf(d, c.now) === "pending");
        if (running) return toWire(running, c.now);

        const emphasis = request.emphasis?.trim().slice(0, EMPHASIS_MAX_CHARS) || null;
        const words = `${found.text} ${emphasis ?? ""}`;
        const bank = chooseBank(`${words} ${found.file_name ?? ""}`, request.year);
        const id = nextId(c.overlay, "d");
        const draft: DemoDraft = {
          id,
          source_id: found.id,
          source: { kind: found.kind, file_name: found.file_name },
          subject,
          year: request.year,
          emphasis,
          refinements: [],
          previous_draft_id: null,
          created_at: iso(c.now),
          updated_at: iso(c.now),
          consumed_at: null,
          lesson_id: null,
          job: startJob(words, found.runs, c.now, GENERATE_MS),
          content: { title: bank.title, review_summary: bank.summary, questions: bankQuestions(bank, id) },
        };
        save(c, {
          ...c.overlay,
          counter: c.overlay.counter + 1,
          sources: c.overlay.sources.map((s) => (s.id === found.id ? { ...s, runs: s.runs + 1 } : s)),
          drafts: trimDrafts([...c.overlay.drafts, draft]),
        });
        return toWire(draft, c.now);
      }),
    getDraft: (draftId) =>
      run(() => {
        // The page asks again and again for a draft that is being written, so a connection that is gone is a failure it can show.
        if (isOffline()) throw new ApiError("network");
        const c = ctx();
        return toWire(findDraft(c, draftId), c.now);
      }),
    listDrafts: () =>
      run(() => {
        const c = ctx();
        return latestUnsaved(c.overlay.drafts).map((d) => toSummary(d, c.now));
      }),
    updateDraft: (draftId, patch) =>
      run(() => {
        // A change needs the server: offline it is not kept, and the page says so and tries again.
        if (isOffline()) throw new ApiError("network");
        const c = ctx();
        const draft = findDraft(c, draftId);
        // Only a draft that is written and not saved can be edited (FR-LES-16: a saved one is the lesson's now).
        if (draft.consumed_at !== null || statusOf(draft, c.now) !== "ready") throw new ApiError("invalid_state", { status: 409 });
        if (!isDraftPatch(patch)) throw invalid();
        const next: DemoDraft = {
          ...draft,
          updated_at: iso(c.now),
          content: {
            title: patch.title ?? draft.content.title,
            review_summary: patch.review_summary ?? draft.content.review_summary,
            questions: patch.questions ?? draft.content.questions,
          },
        };
        save(c, { ...c.overlay, drafts: c.overlay.drafts.map((d) => (d.id === draftId ? next : d)) });
        return toWire(next, c.now);
      }),
    deleteDraft: (draftId) =>
      run(() => {
        if (isOffline()) throw new ApiError("network");
        const c = ctx();
        const draft = findDraft(c, draftId);
        // A saved draft is the lesson's history now (BR-LES-08), not something to throw away (FR-LES-21).
        if (draft.consumed_at !== null) throw new ApiError("invalid_state", { status: 409 });
        save(c, { ...c.overlay, drafts: c.overlay.drafts.filter((d) => d.id !== draftId) });
      }),
    retryDraft: (draftId) =>
      run(() => {
        if (isOffline()) throw new ApiError("network");
        const c = ctx();
        const draft = findDraft(c, draftId);
        const status = statusOf(draft, c.now);
        if (draft.consumed_at !== null || status === "ready") throw new ApiError("invalid_state", { status: 409 });
        // A draft being written answers itself and starts nothing (BR-LES-10).
        if (status === "pending") return toWire(draft, c.now);
        const found = c.overlay.sources.find((s) => s.id === draft.source_id);
        const words = `${found?.text ?? ""} ${draft.emphasis ?? ""}`;
        const ms = draft.refinements.length > 0 ? REFINE_MS : GENERATE_MS;
        const next: DemoDraft = { ...draft, updated_at: iso(c.now), job: startJob(words, found?.runs ?? 1, c.now, ms) };
        save(c, {
          ...c.overlay,
          sources: c.overlay.sources.map((s) => (s.id === draft.source_id ? { ...s, runs: s.runs + 1 } : s)),
          drafts: c.overlay.drafts.map((d) => (d.id === draftId ? next : d)),
        });
        return toWire(next, c.now);
      }),
    refineDraft: (draftId, refinement) =>
      run(() => {
        if (isOffline()) throw new ApiError("network");
        const c = ctx();
        const draft = findDraft(c, draftId);
        const status = statusOf(draft, c.now);
        if (draft.consumed_at !== null || status === "failed") throw new ApiError("invalid_state", { status: 409 });
        // A draft of the source is being written already: that is the answer, and nothing starts (BR-LES-10).
        const running = status === "pending" ? draft : c.overlay.drafts.find((d) => d.source_id !== null && d.source_id === draft.source_id && d.consumed_at === null && statusOf(d, c.now) === "pending");
        if (running) return toWire(running, c.now);

        const id = nextId(c.overlay, "d");
        const found = c.overlay.sources.find((s) => s.id === draft.source_id);
        // It refines the draft as it now is: the questions the teacher edited, not the ones that were written first.
        const questions = refineQuestions(draft.content.questions as Question[], refinement, id).map((q, i) => ({ ...q, id: q.id.startsWith(`${id}-`) ? q.id : `${id}-q${i + 1}` }));
        const refined: DemoDraft = {
          ...draft,
          id,
          refinements: [...draft.refinements, refinement],
          previous_draft_id: draft.id,
          created_at: iso(c.now),
          updated_at: iso(c.now),
          consumed_at: null,
          job: startJob(`${found?.text ?? ""} ${draft.emphasis ?? ""}`, found?.runs ?? 1, c.now, REFINE_MS),
          content: { ...draft.content, questions },
        };
        save(c, { ...c.overlay, counter: c.overlay.counter + 1, drafts: trimDrafts([...c.overlay.drafts, refined]) });
        return toWire(refined, c.now);
      }),
    startEditing: (lessonId) =>
      run(() => {
        if (isOffline()) throw new ApiError("network");
        const c = ctx();
        const lesson = lessonsOf(c).find((l) => l.id === lessonId);
        if (!lesson) throw notFound();
        // The teacher already has this lesson open for editing: that is the draft, so edits are never split between two.
        const open = latestUnsaved(c.overlay.drafts).find((d) => d.lesson_id === lessonId);
        if (open) return toWire(open, c.now);

        const id = nextId(c.overlay, "d");
        const draft: DemoDraft = {
          id,
          source_id: lesson.source?.id ?? null,
          source: lesson.source ? { kind: lesson.source.kind, file_name: lesson.source.file_name } : null,
          subject: lesson.subject,
          year: lesson.year,
          emphasis: lesson.emphasis,
          refinements: [],
          previous_draft_id: null,
          created_at: iso(c.now),
          updated_at: iso(c.now),
          consumed_at: null,
          lesson_id: lessonId,
          job: null,
          content: { title: lesson.title, review_summary: lesson.review_summary, questions: lesson.questions.map((q) => ({ ...q })) },
        };
        save(c, { ...c.overlay, counter: c.overlay.counter + 1, drafts: trimDrafts([...c.overlay.drafts, draft]) });
        return toWire(draft, c.now);
      }),
    saveLesson: (request) =>
      run(() => {
        if (isOffline()) throw new ApiError("network");
        const c = ctx();
        const draft = findDraft(c, request.draft_id);
        // Only a draft that is written, not saved before, and not a lesson's own edit (that is `PUT /lessons/{id}`).
        if (draft.consumed_at !== null || draft.lesson_id !== null || statusOf(draft, c.now) !== "ready") throw new ApiError("invalid_state", { status: 409 });
        if (!isValidContent(request)) throw invalid();
        const id = nextId(c.overlay, "l-n");
        const sourceRecord = c.overlay.sources.find((s) => s.id === draft.source_id);
        const lesson = toLesson(id, request, {
          subject: draft.subject,
          year: draft.year,
          version: 1,
          times_run: 0,
          last_run_at: null,
          last_session_id: null,
          copied_from: null,
          created_at: iso(c.now),
          updated_at: iso(c.now),
          source: sourceRecord ? { id: sourceRecord.id, kind: sourceRecord.kind, file_name: sourceRecord.file_name } : null,
          emphasis: draft.emphasis,
        });
        save(c, {
          ...c.overlay,
          counter: c.overlay.counter + 1,
          lessons: [...c.overlay.lessons, lesson],
          // Saved, not thrown away: it stays readable and leads to its lesson (BR-LES-08).
          drafts: c.overlay.drafts.map((d) => (d.id === draft.id ? { ...d, consumed_at: iso(c.now), lesson_id: id } : d)),
        });
        return lesson;
      }),
    uploadMedia: async (file) => {
      if (isOffline()) throw new ApiError("network");
      // The real API judges a picture by what is in it (BR-LES-05 says so of a document); the demo by its type and size first, and then by
      // whether the browser can read it.
      const problem = checkImage(file);
      if (problem) throw invalid(problem);
      await delay(MEDIA_MS);
      if (isOffline()) throw new ApiError("network");
      let url: string;
      try {
        // Made small, as the server makes its phone-sized variants (FR-LES-11), so that the browser's storage holds more than one.
        url = (await downscaleImage(file, image)).url;
      } catch (e) {
        if (e instanceof UnreadableImage) throw invalid("image_unreadable");
        throw e;
      }
      const c = ctx();
      const id = nextId(c.overlay, "m-n");
      save(c, { ...c.overlay, counter: c.overlay.counter + 1 });
      return { id, url, alt: null };
    },

    listLessons: () => run(() => lessonsOf(ctx()).map(summary)),
    getLesson: (lessonId) =>
      run(() => {
        const c = ctx();
        const own = lessonsOf(c).find((l) => l.id === lessonId);
        if (own) return own;
        // A colleague's lesson in the school library may be read to preview it (FR-LIB-01).
        const entry = libraryEntries(c).find((l) => libraryIdOf(l.key) === lessonId);
        if (!entry) throw notFound();
        return libraryLesson(c, entry.key);
      }),
    updateLesson: (lessonId, request) =>
      run(() => {
        if (isOffline()) throw new ApiError("network");
        const c = ctx();
        const current = lessonsOf(c).find((l) => l.id === lessonId);
        if (!current) throw notFound();
        if (!isValidContent(request)) throw invalid();
        // The draft the lesson was edited in is saved with it; it has to be this lesson's, written and not saved before.
        const draft = request.draft_id === undefined ? null : findDraft(c, request.draft_id);
        if (draft && (draft.consumed_at !== null || draft.lesson_id !== lessonId || statusOf(draft, c.now) !== "ready")) throw new ApiError("invalid_state", { status: 409 });
        const next = toLesson(lessonId, request, {
          subject: current.subject,
          year: current.year,
          version: current.version + 1,
          times_run: current.times_run,
          last_run_at: current.last_run_at,
          last_session_id: current.last_session_id,
          copied_from: current.copied_from,
          created_at: current.created_at,
          updated_at: iso(c.now),
          source: current.source,
          emphasis: current.emphasis,
        });
        save(c, {
          ...c.overlay,
          lessons: [...c.overlay.lessons.filter((l) => l.id !== lessonId), next],
          drafts: draft ? c.overlay.drafts.map((d) => (d.id === draft.id ? { ...d, consumed_at: iso(c.now) } : d)) : c.overlay.drafts,
        });
        return withRuns(c, next);
      }),
    deleteLesson: (lessonId) =>
      run(() => {
        if (isOffline()) throw new ApiError("network");
        const c = ctx();
        if (!lessonsOf(c).some((l) => l.id === lessonId)) throw notFound();
        // The lesson of a lesson that is going on cannot go: the teacher ends the lesson first (PROPOSED, `invalid_state`).
        if (c.overlay.session?.lesson.id === lessonId) throw new ApiError("invalid_state", { status: 409 });
        save(c, {
          ...c.overlay,
          lessons: c.overlay.lessons.filter((l) => l.id !== lessonId),
          deleted: c.overlay.deleted.includes(lessonId) ? c.overlay.deleted : [...c.overlay.deleted, lessonId],
          // What was being changed in the lesson goes with it (PROPOSED), the drafts that were saved from it too: nothing is left that leads to it.
          drafts: c.overlay.drafts.filter((d) => d.lesson_id !== lessonId),
        });
      }),
    listLibrary: () => run(() => libraryOf(ctx())),
    copyFromLibrary: (lessonId) =>
      run(() => {
        if (isOffline()) throw new ApiError("network");
        const c = ctx();
        const entry = libraryEntries(c).find((l) => libraryIdOf(l.key) === lessonId);
        if (!entry) throw notFound();
        const original = libraryLesson(c, entry.key);
        const id = nextId(c.overlay, "l-n");
        const copy = toLesson(id, original, {
          subject: original.subject,
          year: original.year,
          version: 1,
          times_run: 0,
          last_run_at: null,
          last_session_id: null,
          copied_from: { lesson_id: original.id, owner_name: c.world.def.colleagues[entry.colleague].name },
          created_at: iso(c.now),
          updated_at: iso(c.now),
          source: null,
          emphasis: null,
        });
        save(c, { ...c.overlay, counter: c.overlay.counter + 1, lessons: [...c.overlay.lessons, copy] });
        return copy;
      }),

    // ---- The live lesson: step 7 builds the driver ----
    createSession: (request) =>
      run(() => {
        const c = ctx();
        const course = c.world.courses.find((x) => x.course_id === request?.course_id);
        const lesson = lessonsOf(c).find((l) => l.id === request?.lesson_id);
        if (!course || !lesson) throw notFound();
        // At most one open lesson (EC-SES-02 says per course, and `GET /sessions/open` answers one): the demo holds a teacher to one.
        if (c.overlay.session) throw new ApiError("session_open", { status: 409 });
        const session: DemoSession = {
          id: nextId(c.overlay, "s-n"),
          course_id: course.course_id,
          lesson: { id: lesson.id, title: lesson.title, version: lesson.version },
          state: "lobby",
          started_at: iso(c.now),
          teaching_at: null,
          marks: [],
          runs: [],
          adhoc: [],
          anon_answered: {},
        };
        save(c, { ...c.overlay, counter: c.overlay.counter + 1, session });
        return consoleOf({ ...c, overlay: { ...c.overlay, session } }, session, course);
      }),
    getOpenSession: () =>
      run(() => {
        const c = ctx();
        return { server_now: iso(c.now), session: openOf(c) };
      }),
    getConsole: (sessionId) =>
      run(() => {
        const { c, s, course } = liveOf(sessionId);
        return consoleOf(c, s, course);
      }),
    getClassView: (sessionId) =>
      run(() => {
        const ended = endedOf(ctx(), sessionId);
        if (ended) return endedClassView(ctx(), ended);
        const { c, s, course } = liveOf(sessionId);
        return classViewOf(consoleOf(c, s, course));
      }),
    advance: (sessionId, request) =>
      run(() => {
        if (isOffline()) throw new ApiError("network");
        const { c, s, course } = liveOf(sessionId);
        if (request?.to !== "teaching" && request?.to !== "review") throw invalid();
        // Forward only, one state at a time, and nothing moves a lesson that has ended (4.1).
        if (nextState(s.state) !== request.to) throw new ApiError("invalid_state", { status: 409 });
        // The review is not for a lesson with a question still open: it is shown or skipped first (4.2).
        if (request.to === "review" && consoleOf(c, s, course).questions.some((q) => q.status === "open")) throw new ApiError("question_open", { status: 409 });
        const next: DemoSession = { ...s, state: request.to, teaching_at: request.to === "teaching" ? iso(c.now) : s.teaching_at };
        save(c, { ...c.overlay, session: next });
        return consoleOf(c, next, course);
      }),
    fireQuestion: (sessionId, sqId) =>
      run(() => {
        if (isOffline()) throw new ApiError("network");
        const { c, s, course } = liveOf(sessionId);
        const q = questionOf(c, s, course, sqId);
        // Questions are sent while teaching; one that is not ready (sent, skipped) cannot be sent again, and only one is open at a time (4.2).
        if (s.state !== "teaching" || q.status !== "ready") throw new ApiError("invalid_state", { status: 409 });
        if (consoleOf(c, s, course).questions.some((x) => x.status === "open")) throw new ApiError("question_open", { status: 409 });
        const next = touch(s, sqId, { fired_at: iso(c.now) });
        save(c, { ...c.overlay, session: next });
        return consoleOf({ ...c, overlay: { ...c.overlay, session: next } }, next, course);
      }),
    revealQuestion: (sessionId, sqId) =>
      run(() => {
        if (isOffline()) throw new ApiError("network");
        const { c, s, course } = liveOf(sessionId);
        // Only a question that has closed can be revealed (4.2); the reveal of one already revealed is the console as it is.
        const q = questionOf(c, s, course, sqId);
        if (q.status === "revealed") return consoleOf(c, s, course);
        if (q.status !== "closed") throw new ApiError("invalid_state", { status: 409 });
        const next = touch(s, sqId, { revealed_at: iso(c.now) });
        save(c, { ...c.overlay, session: next });
        return consoleOf({ ...c, overlay: { ...c.overlay, session: next } }, next, course);
      }),
    skipQuestion: (sessionId, sqId) =>
      run(() => {
        if (isOffline()) throw new ApiError("network");
        const { c, s, course } = liveOf(sessionId);
        const q = questionOf(c, s, course, sqId);
        if (q.status === "skipped") return consoleOf(c, s, course);
        // Ready, open or closed; once the answer is shown it is part of the lesson (4.2).
        if (q.status === "revealed") throw new ApiError("invalid_state", { status: 409 });
        const next = touch(s, sqId, { skipped_at: iso(c.now) });
        save(c, { ...c.overlay, session: next });
        return consoleOf({ ...c, overlay: { ...c.overlay, session: next } }, next, course);
      }),
    fireAdhoc: (sessionId, request: AdhocRequest) =>
      run(() => {
        if (isOffline()) throw new ApiError("network");
        const { c, s, course } = liveOf(sessionId);
        const question = adhocQuestion(request, s.adhoc.length, runsOf(c, s).length);
        if (!question) throw invalid();
        if (s.state !== "teaching") throw new ApiError("invalid_state", { status: 409 });
        if (consoleOf(c, s, course).questions.some((x) => x.status === "open")) throw new ApiError("question_open", { status: 409 });
        const id = `${s.id}-aq${s.adhoc.length + 1}`;
        const next = touch({ ...s, adhoc: [...s.adhoc, question] }, id, { fired_at: iso(c.now) });
        save(c, { ...c.overlay, session: next });
        return consoleOf({ ...c, overlay: { ...c.overlay, session: next } }, next, course);
      }),
    markNoDevice: (sessionId, studentId, request: NoDeviceRequest) =>
      run(() => {
        if (isOffline()) throw new ApiError("network");
        const { c, s, course } = liveOf(sessionId);
        if (!NO_DEVICE_REASONS.includes(request?.reason)) throw invalid();
        if (!course.students.some((student) => student.id === studentId)) throw notFound();
        // A student who joined with a phone is present by that: the join stands, and a mark never overrides it.
        if (hasJoinedAt(planOf(s, course).find((p) => p.id === studentId), simInput(c, s))) throw new ApiError("invalid_state", { status: 409 });
        const next: DemoSession = { ...s, marks: [...s.marks.filter((m) => m.student_id !== studentId), { student_id: studentId, reason: request.reason, at: iso(c.now) }] };
        save(c, { ...c.overlay, session: next });
        return consoleOf(c, next, course);
      }),
    clearNoDevice: (sessionId, studentId) =>
      run(() => {
        if (isOffline()) throw new ApiError("network");
        const { c, s, course } = liveOf(sessionId);
        if (!course.students.some((student) => student.id === studentId)) throw notFound();
        // Nothing to take back is not an error: the answer is the lesson as it is.
        const next: DemoSession = { ...s, marks: s.marks.filter((m) => m.student_id !== studentId) };
        if (next.marks.length !== s.marks.length) save(c, { ...c.overlay, session: next });
        return consoleOf(c, next, course);
      }),
    markAnonAnswered: (sessionId, anonId, answered) =>
      run(() => {
        if (isOffline()) throw new ApiError("network");
        const { c, s, course } = liveOf(sessionId);
        const item = consoleOf(c, s, course).anon_questions.find((a) => a.id === anonId);
        if (!item || typeof answered !== "boolean") throw item ? invalid() : notFound();
        const { [anonId]: _old, ...rest } = s.anon_answered;
        void _old;
        const next: DemoSession = { ...s, anon_answered: answered ? { ...rest, [anonId]: iso(c.now) } : rest };
        save(c, { ...c.overlay, session: next });
        return { ...item, answered_at: answered ? iso(c.now) : null };
      }),
    endSession: (sessionId) =>
      run(() => {
        if (isOffline()) throw new ApiError("network");
        // A window that ends a lesson another window has already ended is told so, and nothing happens (EC-SES-09).
        if (endedOf(ctx(), sessionId)) throw new ApiError("invalid_state", { status: 409 });
        const { c, s, course } = liveOf(sessionId);
        const ended = endedFrom(consoleOf(c, s, course), iso(c.now));
        save(c, { ...c.overlay, session: null, ended: [...c.overlay.ended, ended] });
        return { server_now: iso(c.now), session: endedRef(ended), attendance: ended.attendance, tally: tallyOf(ended.attendance), most_missed: ended.most_missed };
      }),
    getReview: (sessionId) =>
      run((): SessionReview => {
        const c = ctx();
        const ended = endedOf(c, sessionId);
        if (ended) return { server_now: iso(c.now), session: ended.session, most_missed: ended.most_missed, anon_questions: ended.anon_questions, attendance: ended.attendance };
        const { s, course } = liveOf(sessionId);
        // The review belongs to the end of the lesson: before the lesson reaches it there is nothing to read.
        if (s.state !== "review") throw new ApiError("invalid_state", { status: 409 });
        const snapshot = consoleOf(c, s, course);
        return { server_now: iso(c.now), session: snapshot.session, most_missed: missedOfQuestions(snapshot.questions, s.lesson.title), anon_questions: snapshot.anon_questions, attendance: null };
      }),
    createPracticeSet: (sessionId) =>
      run(() => {
        if (isOffline()) throw new ApiError("network");
        const c = ctx();
        const ended = endedOf(c, sessionId);
        // Only after End (F-12).
        if (!ended) {
          liveOf(sessionId);
          throw new ApiError("invalid_state", { status: 409 });
        }
        // One set per session: asking again gives the one that was made.
        const made = ended.practice?.(c.now);
        if (made) return { practice_set: made.practice_set };
        const picked = selectPracticeQuestions(ended.most_missed.map((m) => ({ id: m.session_question_id, order: m.order, skipped: false, joined: m.joined, missed: m.missed })));
        if (picked.length === 0) return { practice_set: null };
        const record = { id: `pr-${sessionId}`, created_at: iso(c.now), question_ids: picked };
        save(c, { ...c.overlay, practice: { ...c.overlay.practice, [sessionId]: record } });
        return { practice_set: { id: record.id, session_id: sessionId, course_id: ended.session.course_id, created_at: record.created_at, question_count: picked.length } };
      }),
    getPracticeResults: (sessionId) =>
      run(() => {
        const c = ctx();
        const ended = endedOf(c, sessionId);
        const results = ended?.practice?.(c.now);
        if (!results) throw notFound();
        return results;
      }),

    openChannel: (channel, { onEvent, onStatus }) => stream(channel, channel.split(".")[1], onEvent, onStatus),
    subscribe: (listener) => source.subscribe(listener),
  };

  // ---- The demo's own controls ----

  const demo: MockDemo = {
    simulateRunning: () => {
      const c = ctx();
      if (c.overlay.session) return;
      const all = lessonsOf(c);
      const lesson = all.find((l) => l.times_run === 0) ?? all[0];
      // A lesson of the course's subject, and the class of its year if there is one. A teacher who has made no lesson yet is
      // shown one of the demo's own.
      const courses = c.world.courses;
      const course = (lesson && (courses.find((x) => x.def.subject.id === lesson.subject.id && x.def.year === lesson.year) ?? courses.find((x) => x.def.subject.id === lesson.subject.id))) || courses[0];
      const shown = lesson ?? { id: lessonIdOf("procenti"), title: bankLesson("procenti").title, version: 1 };
      const session: DemoSession = {
        id: nextId(c.overlay, "s-n"),
        course_id: course.course_id,
        lesson: { id: shown.id, title: shown.title, version: shown.version },
        state: "lobby",
        // A lesson in the middle of its time, so Today reads like a lesson that is going on.
        started_at: iso(c.now - 12 * 60_000),
        teaching_at: null,
        marks: [],
        runs: [],
        adhoc: [],
        anon_answered: {},
      };
      save(c, { ...c.overlay, counter: c.overlay.counter + 1, session });
    },
  };

  return { api: guarded(api, source), demo };
}

/** The calls that need no session: starting a sign-in, ending one, listening. */
const OPEN: readonly (keyof TeacherApi)[] = ["startSignIn", "signOut", "subscribe", "openChannel"];

/** The API refuses everything else with `unauthenticated` (401) until a teacher is signed in. */
function guarded(api: TeacherApi, source: MockSource): TeacherApi {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(api) as (keyof TeacherApi)[]) {
    const fn = api[key] as (...args: unknown[]) => unknown;
    out[key] = OPEN.includes(key) ? fn : (...args: unknown[]) => (source.session() ? fn(...args) : fail(new ApiError("unauthenticated", { status: 401 })));
  }
  return out as unknown as TeacherApi;
}
