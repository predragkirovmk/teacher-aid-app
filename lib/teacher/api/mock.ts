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
import { nextState } from "../live";
import { resultRows } from "../results";
import { QUESTIONS_MAX } from "../scoring";
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
  type World,
} from "./mock-data";
import { GENERATE_MS, latestUnsaved, REFINE_MS, startJob, statusOf, toSummary, toWire, trimDrafts } from "./mock-drafts";
import { classViewOf, consoleStudents, eventsBetween, planClass, tokenAt, type SimInput } from "./mock-live";
import { anonQuestions, DEMO_NUDGE_AFTER_MS, nudgeAt, showQuestions, withQuestions, type PlayInput, type QuestionRun } from "./mock-questions";
import { adhocQuestion } from "./mock-adhoc";
import { endedFrom } from "./mock-end";
import { demoProviderUrl, isOffline } from "./mock-session";
import { overlayOf, withOverlay, type DemoDraft, type DemoRun, type DemoSession, type MockState, type Overlay, type Persona } from "./mock-state";
import type {
  ChannelEvent,
  ClassViewSnapshot,
  ConsoleSnapshot,
  DraftPatch,
  Id,
  Lesson,
  LessonContent,
  LessonSummary,
  LibraryItem,
  Me,
  OpenSession,
  ResultRow,
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
 * The live lesson (the console, the class view, realtime) is played from the clock alone (mock-live.ts): the students who scan the code, when,
 * who loses the connection and the code are worked out from when the lesson began and what time it is, so two windows agree and a
 * reload finds the lesson where it was. A teacher has one open lesson at a time; End (mock-end.ts) writes down the students who joined with their scores,
 * and the lesson is then read from that record.
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

/** A school as a teacher who has just been invited sees it: the same demo students, and no lesson has ever been run. */
const withoutHistory = (world: World): World => ({ ...world, sessions: [] });

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
  if (!isObject(v) || Object.keys(v).some((k) => k !== "title" && k !== "questions")) return false;
  if (v.title !== undefined && typeof v.title !== "string") return false;
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
    const { def, anchor, sessions } = c.world;
    const keys: { key: string; prepared: boolean }[] = [];
    for (const session of sessions) if (!keys.some((k) => k.key === session.lesson_key)) keys.push({ key: session.lesson_key, prepared: false });
    def.prepared.forEach((key) => keys.push({ key, prepared: true }));

    return keys.map(({ key, prepared }, i) => {
      const bank = bankLesson(key);
      const id = lessonIdOf(key);
      const first = sessions.find((s) => s.lesson_key === key);
      const created = (first ? first.started_at : anchor) - (prepared ? (i % 3) * DAY_MS + DAY_MS : 3 * DAY_MS);
      const questions = bankQuestions(bank, id);
      return {
        id,
        title: bank.title,
        question_count: questions.length,
        version: 1,
        times_run: 0,
        last_run_at: null,
        last_session_id: null,
        copied_from: null,
        created_at: iso(created),
        updated_at: iso(created),
        questions,
        source: { id: `src-${key}`, kind: i % 2 === 0 ? "upload" : "typed", file_name: i % 2 === 0 ? `${bank.title}.docx` : null },
        emphasis: null,
      };
    });
  };

  /** How often and when a lesson was run, from the history and from the lessons ended in the demo, and the latest of them for the way back to its end page. */
  const withRuns = (c: Ctx, lesson: Lesson): Lesson => {
    const runs = [
      ...c.world.sessions.filter((s) => s.lesson_id === lesson.id).map((s) => ({ id: s.id, at: s.ended_at })),
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
      question_count: questions.length,
      version: 1,
      times_run: 0,
      last_run_at: null,
      last_session_id: null,
      copied_from: null,
      created_at: saved,
      updated_at: saved,
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
        question_count: lesson.question_count,
        owner: c.world.def.colleagues[entry.colleague],
        saved_at: lesson.created_at,
        already_copied: copied.has(lesson.id),
      };
    });
  };

  // ---- Making a lesson ----

  /** The demo "writes" a lesson by choosing the bank lesson whose words appear in what the teacher gave. */
  const chooseBank = (words: string): BankLesson => {
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
    // Nothing in the words matches: the same words always give the same lesson.
    return best ?? BANK[text.length % BANK.length];
  };

  const nextId = (overlay: Overlay, prefix: string) => `${prefix}${overlay.counter + 1}`;

  const toLesson = (id: string, content: LessonContent, base: Omit<Lesson, keyof LessonContent | "id" | "question_count">): Lesson => ({
    ...base,
    id,
    title: content.title.trim(),
    questions: content.questions.map((q, i) => ({ ...q, id: `${id}-q${i + 1}`, order: i }) as Question),
    question_count: content.questions.length,
  });

  // ---- The open lesson ----

  const sessionRef = (s: DemoSession): SessionRef => ({
    id: s.id,
    lesson: s.lesson,
    state: s.state,
    started_at: s.started_at,
    ended_at: null,
  });

  /** The open lesson; none when there is none. */
  const openOf = (c: Ctx): OpenSession["session"] => (c.overlay.session ? sessionRef(c.overlay.session) : null);

  /** The lesson of the open session, as it is asked about: the open session of this teacher, else `not_found`. */
  const liveOf = (sessionId: Id) => {
    const c = ctx();
    const s = c.overlay.session;
    if (!s || s.id !== sessionId) throw notFound();
    return { c, s };
  };

  const simInput = (c: Ctx, s: DemoSession): SimInput => ({
    started_at: Date.parse(s.started_at),
    teaching_at: s.teaching_at === null ? null : Date.parse(s.teaching_at),
    now: c.now,
  });

  const planOf = (c: Ctx, s: DemoSession) => planClass(s.id, c.world.students.map((student) => student.id));

  /**
   * What the console shows of a lesson, at the moment of the question: every question ready, and the class as the clock has it (who has
   * scanned the code and who has lost the connection) with the code of this 30-second window.
   */
  const consoleOf = (c: Ctx, s: DemoSession): ConsoleSnapshot => {
    const input = simInput(c, s);
    const plans = planOf(c, s);
    const runs = runsOf(c, s);
    const play: PlayInput = { sessionId: s.id, roster: c.world.students, plans, sim: input };
    const shown = showQuestions(runs, play, c.now);
    const answered = Object.fromEntries(Object.entries(s.anon_answered));
    const snapshot: ConsoleSnapshot = {
      server_now: iso(c.now),
      session: sessionRef(s),
      join: s.state === "ended" ? null : tokenAt(s.id, c.now),
      questions: shown.questions,
      students: withQuestions(consoleStudents(c.world.students, plans, input), shown, c.now),
      anon_questions: anonQuestions(s.id, c.world.students, plans, input, answered, c.now),
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
      return { id, question, adhoc, fired_at: ms(done?.fired_at), skipped_at: ms(done?.skipped_at) };
    };
    return [...prepared.map((q, i) => make(`${s.id}-sq${i + 1}`, q, false)), ...s.adhoc.map((q, i) => make(`${s.id}-aq${i + 1}`, q, true))];
  };

  /** Change what the teacher did with a question; the question is saved as touched. */
  const touch = (s: DemoSession, id: string, change: Partial<Omit<DemoRun, "id">>): DemoSession => {
    const old = s.runs.find((r) => r.id === id) ?? { id, fired_at: null, skipped_at: null };
    return { ...s, runs: [...s.runs.filter((r) => r.id !== id), { ...old, ...change }] };
  };

  /** A question of this lesson and what it is doing now, or `not_found`. */
  const questionOf = (c: Ctx, s: DemoSession, sqId: Id) => {
    const q = consoleOf(c, s).questions.find((x) => x.id === sqId);
    if (!q) throw notFound();
    return q;
  };

  // ---- Lessons that have ended ----

  /**
   * A lesson that has ended, as the review and the end page read it: one the teacher ended in the demo (frozen when End was pressed), or one of
   * the school's history. `students` are those who joined, with their scores, in register order.
   */
  type EndedView = { session: SessionRef; students: ResultRow[] };

  const endedRef = (e: { id: string; lesson: SessionRef["lesson"]; started_at: string; ended_at: string }): SessionRef => ({
    id: e.id,
    lesson: e.lesson,
    state: "ended",
    started_at: e.started_at,
    ended_at: e.ended_at,
  });

  const endedOf = (c: Ctx, sessionId: Id): EndedView | null => {
    const frozen = c.overlay.ended.find((e) => e.id === sessionId);
    if (frozen) return { session: endedRef(frozen), students: frozen.students };
    const seeded = c.world.sessions.find((x) => x.id === sessionId);
    if (!seeded) return null;
    const names = new Map(c.world.students.map((st) => [st.id, st.full_name]));
    // The finished lesson keeps only the students who were there. A skipped question counts for nobody.
    const questions = seeded.questions
      .filter((sq) => !sq.skipped)
      .map((sq) => ({ fired_at: sq.fired_at, right: new Set(seeded.answers.filter((a) => a.question_id === sq.id && a.correct).map((a) => a.student_id)) }));
    const students = resultRows(
      seeded.joins.map((j) => ({ student_id: j.student_id, full_name: names.get(j.student_id) ?? "", joined_at: j.joined_at })),
      questions,
    );
    return {
      session: endedRef({ id: seeded.id, lesson: { id: seeded.lesson_id, title: seeded.lesson_title, version: 1 }, started_at: iso(seeded.started_at), ended_at: iso(seeded.ended_at) }),
      students,
    };
  };

  /** The projector's snapshot of a lesson that has ended: it says the lesson is over and holds nothing a name could leak through. */
  const endedClassView = (c: Ctx, e: EndedView): ClassViewSnapshot => ({
    server_now: iso(c.now),
    session: {
      id: e.session.id,
      state: "ended",
      lesson_title: e.session.lesson.title,
      joined_count: e.students.length,
      recent: [],
    },
    join: null,
    question: null,
    progress: null,
    reveal: null,
    skipped: false,
    board: [],
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
        const { c, s } = liveOf(sessionId);
        return consoleOf(c, s);
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
        // One generation of a source at a time: a double press is answered with the draft already being written (BR-LES-10).
        const running = c.overlay.drafts.find((d) => d.source_id === found.id && d.consumed_at === null && statusOf(d, c.now) === "pending");
        if (running) return toWire(running, c.now);

        const emphasis = request.emphasis?.trim().slice(0, EMPHASIS_MAX_CHARS) || null;
        const words = `${found.text} ${emphasis ?? ""}`;
        const bank = chooseBank(`${words} ${found.file_name ?? ""}`);
        const id = nextId(c.overlay, "d");
        const draft: DemoDraft = {
          id,
          source_id: found.id,
          source: { kind: found.kind, file_name: found.file_name },
          emphasis,
          refinements: [],
          previous_draft_id: null,
          created_at: iso(c.now),
          updated_at: iso(c.now),
          consumed_at: null,
          lesson_id: null,
          job: startJob(words, found.runs, c.now, GENERATE_MS),
          content: { title: bank.title, questions: bankQuestions(bank, id) },
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
          emphasis: lesson.emphasis,
          refinements: [],
          previous_draft_id: null,
          created_at: iso(c.now),
          updated_at: iso(c.now),
          consumed_at: null,
          lesson_id: lessonId,
          job: null,
          content: { title: lesson.title, questions: lesson.questions.map((q) => ({ ...q })) },
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
        const lesson = lessonsOf(c).find((l) => l.id === request?.lesson_id);
        if (!lesson) throw notFound();
        // At most one open lesson (`GET /sessions/open` answers one): the demo holds a teacher to one.
        if (c.overlay.session) throw new ApiError("session_open", { status: 409 });
        const session: DemoSession = {
          id: nextId(c.overlay, "s-n"),
          lesson: { id: lesson.id, title: lesson.title, version: lesson.version },
          state: "lobby",
          started_at: iso(c.now),
          teaching_at: null,
          runs: [],
          adhoc: [],
          anon_answered: {},
        };
        save(c, { ...c.overlay, counter: c.overlay.counter + 1, session });
        return consoleOf({ ...c, overlay: { ...c.overlay, session } }, session);
      }),
    getOpenSession: () =>
      run(() => {
        const c = ctx();
        return { server_now: iso(c.now), session: openOf(c) };
      }),
    getConsole: (sessionId) =>
      run(() => {
        const { c, s } = liveOf(sessionId);
        return consoleOf(c, s);
      }),
    getClassView: (sessionId) =>
      run(() => {
        const ended = endedOf(ctx(), sessionId);
        if (ended) return endedClassView(ctx(), ended);
        const { c, s } = liveOf(sessionId);
        return classViewOf(consoleOf(c, s));
      }),
    advance: (sessionId, request) =>
      run(() => {
        if (isOffline()) throw new ApiError("network");
        const { c, s } = liveOf(sessionId);
        if (request?.to !== "teaching") throw invalid();
        // Forward only, one state at a time, and nothing moves a lesson that has ended (4.1).
        if (nextState(s.state) !== request.to) throw new ApiError("invalid_state", { status: 409 });
        const next: DemoSession = { ...s, state: request.to, teaching_at: iso(c.now) };
        save(c, { ...c.overlay, session: next });
        return consoleOf(c, next);
      }),
    fireQuestion: (sessionId, sqId) =>
      run(() => {
        if (isOffline()) throw new ApiError("network");
        const { c, s } = liveOf(sessionId);
        const q = questionOf(c, s, sqId);
        // Questions are sent while teaching; one that is not ready (sent, skipped) cannot be sent again, and only one is open at a time (4.2).
        if (s.state !== "teaching" || q.status !== "ready") throw new ApiError("invalid_state", { status: 409 });
        if (consoleOf(c, s).questions.some((x) => x.status === "open")) throw new ApiError("question_open", { status: 409 });
        const next = touch(s, sqId, { fired_at: iso(c.now) });
        save(c, { ...c.overlay, session: next });
        return consoleOf({ ...c, overlay: { ...c.overlay, session: next } }, next);
      }),
    skipQuestion: (sessionId, sqId) =>
      run(() => {
        if (isOffline()) throw new ApiError("network");
        const { c, s } = liveOf(sessionId);
        const q = questionOf(c, s, sqId);
        if (q.status === "skipped") return consoleOf(c, s);
        // Ready or open; once the question has ended its answer is shown and it is part of the lesson (4.2).
        if (q.status === "revealed") throw new ApiError("invalid_state", { status: 409 });
        const next = touch(s, sqId, { skipped_at: iso(c.now) });
        save(c, { ...c.overlay, session: next });
        return consoleOf({ ...c, overlay: { ...c.overlay, session: next } }, next);
      }),
    fireAdhoc: (sessionId, request: AdhocRequest) =>
      run(() => {
        if (isOffline()) throw new ApiError("network");
        const { c, s } = liveOf(sessionId);
        const question = adhocQuestion(request, s.adhoc.length, runsOf(c, s).length);
        if (!question) throw invalid();
        if (s.state !== "teaching") throw new ApiError("invalid_state", { status: 409 });
        if (consoleOf(c, s).questions.some((x) => x.status === "open")) throw new ApiError("question_open", { status: 409 });
        const id = `${s.id}-aq${s.adhoc.length + 1}`;
        const next = touch({ ...s, adhoc: [...s.adhoc, question] }, id, { fired_at: iso(c.now) });
        save(c, { ...c.overlay, session: next });
        return consoleOf({ ...c, overlay: { ...c.overlay, session: next } }, next);
      }),
    markAnonAnswered: (sessionId, anonId, answered) =>
      run(() => {
        if (isOffline()) throw new ApiError("network");
        const { c, s } = liveOf(sessionId);
        const item = consoleOf(c, s).anon_questions.find((a) => a.id === anonId);
        if (!item || typeof answered !== "boolean") throw item ? invalid() : notFound();
        const { [anonId]: _old, ...rest } = s.anon_answered;
        void _old;
        const next: DemoSession = { ...s, anon_answered: answered ? { ...rest, [anonId]: iso(c.now) } : rest };
        save(c, { ...c.overlay, session: next });
        return { ...item, answered_at: answered ? iso(c.now) : null };
      }),
    endSession: (sessionId) =>
      run((): SessionReview => {
        if (isOffline()) throw new ApiError("network");
        // A window that ends a lesson another window has already ended is told so, and nothing happens (EC-SES-09).
        if (endedOf(ctx(), sessionId)) throw new ApiError("invalid_state", { status: 409 });
        const { c, s } = liveOf(sessionId);
        const snapshot = consoleOf(c, s);
        // Only the questions that have ended count: a skipped one, one never sent and one still open have no result. A quick question always has a right answer in the demo.
        const plays = showQuestions(runsOf(c, s), { sessionId: s.id, roster: c.world.students, plans: planOf(c, s), sim: simInput(c, s) }, c.now).plays;
        const questions = snapshot.questions
          .filter((q) => q.status === "revealed" && q.fired_at !== null)
          .map((q) => ({ fired_at: Date.parse(q.fired_at as string), right: new Set((plays.get(q.id)?.answers ?? []).filter((a) => a.correct).map((a) => a.student_id)) }));
        const students = resultRows(
          snapshot.students.map((st) => ({ student_id: st.id, full_name: st.full_name, joined_at: Date.parse(st.joined_at) })),
          questions,
        );
        const ended = endedFrom(snapshot, students, iso(c.now));
        save(c, { ...c.overlay, session: null, ended: [...c.overlay.ended, ended] });
        return { server_now: iso(c.now), session: endedRef(ended), students: ended.students };
      }),
    getReview: (sessionId) =>
      run((): SessionReview => {
        const c = ctx();
        const ended = endedOf(c, sessionId);
        // The review belongs to the end of the lesson: while it is open there is nothing to read.
        if (!ended) {
          liveOf(sessionId);
          throw new ApiError("invalid_state", { status: 409 });
        }
        return { server_now: iso(c.now), session: ended.session, students: ended.students };
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
      // A teacher who has made no lesson yet is shown one of the demo's own.
      const shown = lesson ?? { id: lessonIdOf("procenti"), title: bankLesson("procenti").title, version: 1 };
      const session: DemoSession = {
        id: nextId(c.overlay, "s-n"),
        lesson: { id: shown.id, title: shown.title, version: shown.version },
        state: "lobby",
        // A lesson in the middle of its time, so it reads like a lesson that is going on.
        started_at: iso(c.now - 12 * 60_000),
        teaching_at: null,
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
