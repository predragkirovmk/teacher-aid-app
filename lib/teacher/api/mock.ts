import {
  EMPHASIS_MAX_CHARS,
  isValidContent,
  LESSON_UPLOAD_EXTENSIONS,
  LESSON_UPLOAD_MAX_BYTES,
  TYPED_TEXT_MIN_CHARS,
} from "../lessons";
import type { SchoolType } from "../store";
import type { SettledPromise, TeacherApi, Unsubscribe } from "./client";
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
import { overlayOf, withOverlay, type MockState, type Overlay } from "./mock-state";
import type {
  AttendanceTally,
  CourseDashboard,
  CourseSummary,
  DashboardPractice,
  DashboardSession,
  DashboardTopic,
  Id,
  Lesson,
  LessonContent,
  LessonDraft,
  LessonSummary,
  LibraryItem,
  Me,
  PracticeResults,
  Question,
} from "./types";

/**
 * The mock adapter: the whole backend played in the browser over a demo school and what the teacher
 * has changed in it (mock-state.ts). It answers in the wire types, as the API would.
 *
 * Reads and quick changes return already-settled promises (see SettledPromise), so the hooks can show
 * the data in the render that asks for it. Writing a lesson takes a moment, as the AI does.
 *
 * What a real teacher cannot trigger, the demo can, so the screens' failure states can be tried:
 * a typed text or emphasis containing `[fail]` makes the AI fail, and a document named like a scan
 * (`scan` or `скен`) has no text in it.
 *
 * The live lesson (sessions, the console, the class view, realtime) is not built yet: those calls answer
 * `not_implemented`, except `getOpenSession`, which answers that nothing is open.
 */

/** What the mock reads and writes: the saved state, the demo school the app is on, the clock. */
export type MockSource = {
  state(): MockState;
  /** Replace the saved state. */
  commit(next: MockState): void;
  schoolType(): SchoolType;
  now(): number;
  /** Called when the state or the school changes behind the adapter's back: another window, a reset, the demo switch. */
  subscribe(listener: () => void): Unsubscribe;
};

/** A source that keeps everything in memory: the server render's, and the tests'. */
export function memorySource(
  initial: MockState,
  options: { schoolType?: SchoolType; now?: () => number } = {},
): MockSource & { setSchoolType(type: SchoolType): void } {
  let state = initial;
  let type = options.schoolType ?? "school";
  const listeners = new Set<() => void>();
  return {
    state: () => state,
    commit: (next) => {
      state = next;
    },
    schoolType: () => type,
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

/** How long the AI takes in the demo: long enough to see the wait, short enough not to be a chore. */
export const GENERATE_MS = 1600;
export const REFINE_MS = 900;
const MAX_DRAFTS = 20;
const MAX_SOURCES = 20;

type Ctx = { type: SchoolType; state: MockState; overlay: Overlay; world: World; now: number };

export function createMockApi(
  source: MockSource,
  options: { delay?: (ms: number) => Promise<void> } = {},
): TeacherApi {
  const delay = options.delay ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  const ctx = (): Ctx => {
    const type = source.schoolType();
    const state = source.state();
    return { type, state, overlay: overlayOf(state, type), world: buildWorld(type, state.anchor), now: source.now() };
  };
  /** Save a changed overlay. */
  const save = (c: Ctx, overlay: Overlay) => source.commit(withOverlay(c.state, c.type, overlay));

  // ---- The teacher's lessons ----

  /** The lessons of the school's history and the two prepared ones, as they were before the teacher changed anything. */
  const seededLessons = (c: Ctx): Lesson[] => {
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
      subject: def.librarySubject,
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

  const libraryOf = (c: Ctx): LibraryItem[] =>
    c.world.def.library.map((entry) => {
      const lesson = libraryLesson(c, entry.key);
      const owner = c.world.def.colleagues[entry.colleague];
      return {
        lesson_id: lesson.id,
        title: lesson.title,
        subject: lesson.subject,
        year: lesson.year,
        question_count: lesson.question_count,
        owner,
        saved_at: lesson.created_at,
        already_copied: lessonsOf(c).some((l) => l.copied_from?.lesson_id === lesson.id),
      };
    });

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

  const dashboardPractice = (course: SeedCourse, session: SeedSession): DashboardPractice | null => {
    const p = session.practice;
    if (!p) return null;
    const done = p.results.filter((r) => r.completed_at !== null && r.score !== null);
    return {
      practice_set: { id: p.id, session_id: session.id, course_id: course.course_id, created_at: iso(p.created_at), question_count: p.question_ids.length },
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

  const api: TeacherApi = {
    getMe: () =>
      run(() => {
        const c = ctx();
        const { school, teacher } = c.world.def;
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

    createSource: (input) =>
      run(() => {
        const c = ctx();
        let record;
        if (input.kind === "typed") {
          const text = input.text.trim();
          if (text.length < TYPED_TEXT_MIN_CHARS) throw invalid("text_too_short");
          record = { id: nextId(c.overlay, "src-n"), kind: "typed" as const, file_name: null, text: text.slice(0, 4000) };
        } else {
          const { file } = input;
          const name = file.name.toLowerCase();
          if (!LESSON_UPLOAD_EXTENSIONS.some((ext) => name.endsWith(ext))) throw invalid("file_type");
          if (file.size === 0) throw invalid("empty");
          if (file.size > LESSON_UPLOAD_MAX_BYTES) throw invalid("file_too_large");
          // A scan is a picture of a page: there is no text to read (BR-LES-05).
          if (/scan|скен/i.test(name)) throw invalid("no_text");
          record = { id: nextId(c.overlay, "src-n"), kind: "upload" as const, file_name: file.name, text: file.name };
        }
        save(c, { ...c.overlay, counter: c.overlay.counter + 1, sources: [...c.overlay.sources, record].slice(-MAX_SOURCES) });
        return { source_id: record.id };
      }),

    generateLesson: async (request) => {
      await delay(GENERATE_MS);
      const c = ctx();
      const found = c.overlay.sources.find((s) => s.id === request.source_id);
      if (!found) throw notFound();
      const subject = c.world.courses.map((course) => course.def.subject).find((s) => s.id === request.subject_id);
      if (!subject || !Number.isInteger(request.year) || request.year < 1 || request.year > 6) throw invalid();
      const emphasis = request.emphasis?.trim().slice(0, EMPHASIS_MAX_CHARS) || null;
      if (/\[fail\]/i.test(`${found.text} ${emphasis ?? ""}`)) throw new ApiError("generation_failed", { status: 502 });

      const bank = chooseBank(`${found.text} ${emphasis ?? ""} ${found.file_name ?? ""}`, request.year);
      const id = nextId(c.overlay, "d");
      const draft: LessonDraft = {
        id,
        source_id: found.id,
        subject,
        year: request.year,
        emphasis,
        refinements: [],
        created_at: iso(c.now),
        title: bank.title,
        review_summary: bank.summary,
        questions: bankQuestions(bank, id),
      };
      save(c, { ...c.overlay, counter: c.overlay.counter + 1, drafts: [...c.overlay.drafts, draft].slice(-MAX_DRAFTS) });
      return draft;
    },
    getDraft: (draftId) =>
      run(() => {
        const draft = ctx().overlay.drafts.find((d) => d.id === draftId);
        if (!draft) throw notFound();
        return draft;
      }),
    refineDraft: async (draftId, refinement) => {
      await delay(REFINE_MS);
      const c = ctx();
      const draft = c.overlay.drafts.find((d) => d.id === draftId);
      if (!draft) throw notFound();
      const id = nextId(c.overlay, "d");
      const refined: LessonDraft = {
        ...draft,
        id,
        created_at: iso(c.now),
        refinements: [...draft.refinements, refinement],
        questions: refineQuestions(draft.questions, refinement, id).map((q, i) => ({ ...q, id: q.id.startsWith(`${id}-`) ? q.id : `${id}-q${i + 1}` })),
      };
      save(c, { ...c.overlay, counter: c.overlay.counter + 1, drafts: [...c.overlay.drafts, refined].slice(-MAX_DRAFTS) });
      return refined;
    },
    saveLesson: (request) =>
      run(() => {
        const c = ctx();
        const draft = c.overlay.drafts.find((d) => d.id === request.draft_id);
        if (!draft) throw notFound();
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
          drafts: c.overlay.drafts.filter((d) => d.id !== draft.id),
        });
        return lesson;
      }),
    uploadMedia: () => notImplemented(),

    listLessons: () => run(() => lessonsOf(ctx()).map(summary)),
    getLesson: (lessonId) =>
      run(() => {
        const c = ctx();
        const own = lessonsOf(c).find((l) => l.id === lessonId);
        if (own) return own;
        // A colleague's lesson in the school library may be read to preview it (FR-LIB-01).
        const entry = c.world.def.library.find((l) => libraryIdOf(l.key) === lessonId);
        if (!entry) throw notFound();
        return libraryLesson(c, entry.key);
      }),
    updateLesson: (lessonId, request) =>
      run(() => {
        const c = ctx();
        const current = lessonsOf(c).find((l) => l.id === lessonId);
        if (!current) throw notFound();
        if (!isValidContent(request)) throw invalid();
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
        save(c, { ...c.overlay, lessons: [...c.overlay.lessons.filter((l) => l.id !== lessonId), next] });
        return withRuns(c.world, next);
      }),
    deleteLesson: (lessonId) =>
      run(() => {
        const c = ctx();
        if (!lessonsOf(c).some((l) => l.id === lessonId)) throw notFound();
        save(c, {
          ...c.overlay,
          lessons: c.overlay.lessons.filter((l) => l.id !== lessonId),
          deleted: c.overlay.deleted.includes(lessonId) ? c.overlay.deleted : [...c.overlay.deleted, lessonId],
        });
      }),
    listLibrary: () => run(() => libraryOf(ctx())),
    copyFromLibrary: (lessonId) =>
      run(() => {
        const c = ctx();
        const entry = c.world.def.library.find((l) => libraryIdOf(l.key) === lessonId);
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
    createSession: () => notImplemented(),
    getOpenSession: () => run(() => ({ server_now: iso(source.now()), session: null })),
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
            practice_set: { id: p.id, session_id: session.id, course_id: course.course_id, created_at: iso(p.created_at), question_count: p.question_ids.length },
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

  return api;
}
