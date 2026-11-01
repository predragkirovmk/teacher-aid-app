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
import { QUESTIONS_MAX } from "../scoring";
import type { SchoolType } from "../store";
import type { CallOptions, DemoControls, SettledPromise, TeacherApi, Unsubscribe } from "./client";
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
import { demoProviderUrl, isOffline } from "./mock-session";
import { overlayOf, withOverlay, type DemoDraft, type DemoSession, type MockState, type Overlay, type Persona } from "./mock-state";
import type {
  AttendanceTally,
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
  OpenSession,
  PracticeResults,
  PracticeSetSummary,
  Question,
  SessionRef,
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
 * `DRAFT_PENDING_MAX_SECONDS`, and then it has failed), and a document named like a scan (`scan` or `скен`) has no text in it.
 * A computer that is offline cannot reach it, as the real API cannot be reached.
 *
 * Writing a lesson is a job, as it is in the API (BR-LES-08): `generateLesson` answers at once with the draft pending, and the draft is
 * ready `GENERATE_MS` later by the clock (mock-drafts.ts), however the page was left or reloaded in the meantime.
 *
 * The live lesson (the console, the class view, realtime) is not built yet: those calls answer `not_implemented`. What
 * Today needs is: `createSession` opens a lesson in the lobby, `getOpenSession` reports it, and a teacher has one open
 * lesson at a time. Ending it is step 9's, so until then the demo closes it from Settings (`MockDemo`).
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

/** What only the mock can do, for the demo's Settings: show a lesson that is running, and close it. */
export type MockDemo = Pick<DemoControls, "simulateRunning" | "closeRunning">;

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

const notImplemented = <T>(): SettledPromise<T> => fail(new ApiError("not_implemented"));

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

/** What a test may replace: how time passes, and what the browser does with a picture. */
export type MockOptions = { delay?: Delay; image?: ImageEnv };

/** The adapter alone, for the tests and the server render. */
export const createMockApi = (source: MockSource, options: MockOptions = {}): TeacherApi => createMock(source, options).api;

export function createMock(source: MockSource, options: MockOptions = {}): { api: TeacherApi; demo: MockDemo } {
  const delay = options.delay ?? wait;
  const image = options.image ?? browserImageEnv;

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

  /** How often and when a lesson was run, from the history. */
  const withRuns = (world: World, lesson: Lesson): Lesson => {
    const runs = world.courses.flatMap((course) => course.sessions).filter((s) => s.lesson_id === lesson.id);
    return {
      ...lesson,
      times_run: runs.length,
      last_run_at: runs.length ? iso(Math.max(...runs.map((s) => s.ended_at))) : null,
    };
  };

  const lessonsOf = (c: Ctx): Lesson[] => {
    const changed = new Set(c.overlay.lessons.map((l) => l.id));
    const kept = seededLessons(c).filter((l) => !c.overlay.deleted.includes(l.id) && !changed.has(l.id));
    return [...kept, ...c.overlay.lessons].map((l) => withRuns(c.world, l)).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
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
    const last = course.sessions.length ? Math.max(...course.sessions.map((s) => s.ended_at)) : null;
    return {
      id: course.course_id,
      subject: course.def.subject,
      class: { id: course.class_id, name: course.def.name, year: course.def.year },
      student_count: course.students.length,
      speed_bonus_on: c.overlay.speed_bonus[course.course_id] ?? true,
      lessons_run: course.sessions.length,
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

  const dashboardOf = (c: Ctx, course: SeedCourse): CourseDashboard => {
    const names = new Map(course.students.map((s) => [s.id, s.full_name]));
    const newestFirst = [...course.sessions].reverse();
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
      sessions: newestFirst.map(dashboardSession),
      attendance: course.sessions.flatMap((s) =>
        s.marks.map((m) => ({ session_id: s.id, student_id: m.student_id, status: m.status, no_device_reason: m.reason })),
      ),
      topics: dashboardTopics(course),
      focus_flags: newestFirst.flatMap((s) =>
        s.focus.map((f) => ({
          student_id: f.student_id,
          session_question_id: f.question_id,
          lost_at: iso(f.lost_at),
          back_at: iso(f.back_at),
          session_id: s.id,
          away_seconds: Math.round((f.back_at - f.lost_at) / 1000),
        })),
      ),
      anon_questions: newestFirst.flatMap((s) =>
        s.anon.map((a) => ({
          id: a.id,
          text: a.text,
          sender: { id: a.sender_id, name: names.get(a.sender_id) ?? "" },
          created_at: iso(a.created_at),
          answered_at: a.answered_at === null ? null : iso(a.answered_at),
          session_id: s.id,
        })),
      ),
      practice: newestFirst.map((s) => dashboardPractice(course, s)).filter((p): p is DashboardPractice => p !== null),
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

  /** What the console shows of a lesson that has just been opened: every question ready, every student of the class not yet in. */
  const consoleOf = (c: Ctx, s: DemoSession, course: SeedCourse, lesson: Lesson): ConsoleSnapshot => ({
    server_now: iso(c.now),
    session: { ...sessionRef(s), class_name: course.def.name, subject_name: course.def.subject.name },
    questions: lesson.questions.map((question, i) => ({
      id: `${s.id}-sq${i + 1}`,
      question,
      status: "ready",
      adhoc: false,
      fired_at: null,
      closes_at: null,
      closed_at: null,
      revealed_at: null,
      skipped_at: null,
      answered: 0,
      joined: 0,
    })),
    students: course.students.map((student) => ({
      id: student.id,
      full_name: student.full_name,
      attendance: null,
      joined_at: null,
      no_device_reason: null,
      online: false,
      answer_state: null,
      focus_flags: 0,
      points: 0,
    })),
    anon_questions: [],
    focus_flags: [],
    board: [],
    nudge: false,
  });

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
        return c.world.courses.map((course) => courseSummary(c, course));
      }),
    getDashboard: (courseId) =>
      run(() => {
        const c = ctx();
        return dashboardOf(c, findCourse(c, courseId));
      }),
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
        return withRuns(c.world, next);
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
        };
        save(c, { ...c.overlay, counter: c.overlay.counter + 1, session });
        return consoleOf(c, session, course, lesson);
      }),
    getOpenSession: () =>
      run(() => {
        const c = ctx();
        return { server_now: iso(c.now), session: openOf(c) };
      }),
    getConsole: () => notImplemented(),
    getClassView: () => notImplemented(),
    advance: () => notImplemented(),
    fireQuestion: () => notImplemented(),
    revealQuestion: () => notImplemented(),
    skipQuestion: () => notImplemented(),
    fireAdhoc: () => notImplemented(),
    markNoDevice: () => notImplemented(),
    markAnonAnswered: () => notImplemented(),
    endSession: () => notImplemented(),
    getReview: () => notImplemented(),
    createPracticeSet: () => notImplemented(),
    getPracticeResults: (sessionId) =>
      run(() => {
        const c = ctx();
        for (const course of c.world.courses) {
          const session = course.sessions.find((s) => s.id === sessionId);
          if (!session?.practice) continue;
          const names = new Map(course.students.map((s) => [s.id, s.full_name]));
          const p = session.practice;
          const results: PracticeResults = {
            practice_set: practiceSummary(course, session, p),
            students: p.results.map((r) => ({
              student_id: r.student_id,
              full_name: names.get(r.student_id) ?? "",
              score: r.score,
              completed_at: r.completed_at === null ? null : iso(r.completed_at),
            })),
          };
          return results;
        }
        throw notFound();
      }),

    openChannel: () => {
      throw new ApiError("not_implemented");
    },
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
      };
      save(c, { ...c.overlay, counter: c.overlay.counter + 1, session });
    },
    closeRunning: () => {
      const c = ctx();
      if (c.overlay.session) save(c, { ...c.overlay, session: null });
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
