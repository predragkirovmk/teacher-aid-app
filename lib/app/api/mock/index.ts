import type { ApiClient, SettledPromise } from "../client";
import { ApiError, toApiError } from "../errors";
import type {
  AnswerInput,
  AnswerReceipt,
  AttendanceEntry,
  AttendanceSummary,
  Badge,
  Course,
  Id,
  JoinInput,
  Leaderboard,
  LeaderboardRow,
  Locale,
  Notification,
  PhotoUpload,
  ProfileUpdate,
  SessionResult,
  SettingsUpdate,
  Student,
  StudentSessionState,
} from "../types";
import {
  ACHIEVEMENTS,
  BASE_ATTENDED,
  BASE_LOG,
  BASE_TOTAL,
  LAST_WEEK_ATTENDED,
  LAST_WEEK_TOTAL,
  LEADERBOARD,
  NOTIFS,
  QUIZ,
  SUBJECTS,
  type SubjectId,
} from "./data";
import { translate, type Key } from "../../i18n";
import { getLocale, setLocale, subscribeLocale } from "../../locale";
import { joinMock, mockSessionFor } from "./session";
import { startMockSignIn, verifyMockCode } from "./signin";
import { actions, DEFAULT_STATE, getState, subscribeStore, type AppState } from "./store";
import { cleanName, nameError } from "../../profile-rules";

/**
 * The mock adapter: the whole backend played in the browser over the demo's local store and
 * fixtures, so the app behaves as it always has with no server. It answers like the API would, in
 * the domain types, with the strings the fixtures carry written in the student's language (the live
 * API sends one script and the client transliterates for English).
 *
 * Every method returns an already-settled promise (see SettledPromise), so hooks can read the data
 * in the render that asks for it, as they could when screens read the store directly.
 */

const ok = <T>(value: T): SettledPromise<T> => {
  const p = Promise.resolve(value) as SettledPromise<T>;
  p.settled = { ok: true, value };
  return p;
};

const fail = <T>(error: ApiError): SettledPromise<T> => {
  const p = Promise.reject(error) as SettledPromise<T>;
  p.settled = { ok: false, error };
  p.catch(() => {}); // the hook reads `settled`; nothing else may call this a lost rejection
  return p;
};

const run = <T>(fn: () => T): SettledPromise<T> => {
  try {
    return ok(fn());
  } catch (e) {
    return fail(toApiError(e));
  }
};

/** What the mock reads from: the saved demo state and the language, now or as the server renders them. */
export type MockSource = { state: () => AppState; locale: () => Locale; writable: boolean };

const CLASS_NAME: Record<Locale, string> = { mk: "7Б", en: "7B" };

const text = (locale: Locale, key: string) => translate(locale, key as Key);

function buildCourses(locale: Locale): Course[] {
  return SUBJECTS.map((s) => ({
    id: s.id,
    subjectId: s.id,
    subjectName: text(locale, `subj.${s.id}`),
    teacherName: text(locale, `teacher.${s.id}`),
    classId: "class-7b",
    className: CLASS_NAME[locale],
    // The old search matched both languages, so the other one's spelling stays findable.
    searchTerms: (["en", "mk"] as const).flatMap((l) => [text(l, `subj.${s.id}`), text(l, `teacher.${s.id}`)]),
  }));
}

function buildStudent(state: AppState, locale: Locale): Student {
  return {
    id: "student-marko",
    fullName: text(locale, "user.name"),
    schoolEmail: "marko.trajkovski@student.gnaumov.edu.mk",
    displayName: state.profile.name,
    photoUrl: state.profile.photo,
    school: { id: "school-gn", name: text(locale, "user.school") },
    class: { id: "class-7b", name: CLASS_NAME[locale] },
    settings: { notificationsOn: state.notificationsOn, locale },
  };
}

function buildAttendance(state: AppState, locale: Locale): AttendanceSummary {
  const { checkins } = state;
  const attended = BASE_ATTENDED + checkins.length;
  const total = BASE_TOTAL + checkins.length;
  const log: AttendanceEntry[] = [
    ...checkins.map((c) => ({
      id: c.id,
      courseId: c.subject,
      subjectId: c.subject,
      subjectName: text(locale, `subj.${c.subject}`),
      date: c.at,
      status: c.late ? ("late" as const) : ("present" as const),
      joinedAt: c.at,
    })),
    ...BASE_LOG.map((l) => ({
      id: l.id,
      courseId: l.subject,
      subjectId: l.subject,
      subjectName: text(locale, `subj.${l.subject}`),
      date: new Date(`${l.date}T12:00`).getTime(),
      status: l.status,
      joinedAt: null,
    })),
  ];
  return {
    attended,
    total,
    percent: Math.round((attended / total) * 100),
    percentWeekAgo: Math.round((LAST_WEEK_ATTENDED / LAST_WEEK_TOTAL) * 100),
    log,
  };
}

/** The live sessions played in the demo, newest first, then the last maths lesson the demo starts with (4 of 5 correct). */
function buildResults(state: AppState, locale: Locale): SessionResult[] {
  return [
    ...state.finished.map((f) => ({
      sessionId: f.sessionId,
      courseId: f.courseId,
      subjectId: f.courseId,
      subjectName: text(locale, `subj.${f.courseId}`),
      lessonTitle: f.lessonTitle,
      endedAt: f.endedAt,
      right: f.right,
      total: f.total,
      questions: f.questions,
    })),
    {
      sessionId: "session-math-1",
      courseId: "math",
      subjectId: "math",
      subjectName: text(locale, "subj.math"),
      lessonTitle: text(locale, "sum.lesson"),
      endedAt: new Date("2026-10-12T09:40").getTime(),
      right: QUIZ.filter((q) => q.correct).length,
      total: QUIZ.length,
      questions: QUIZ.map((q) => ({
        id: q.id,
        prompt: text(locale, `q.${q.id}`),
        correct: q.correct,
        correctAnswer: text(locale, `a.${q.id}`),
        yourAnswer: null,
      })),
    },
  ];
}

const BADGE_POINTS = 20;
/** Achievements the demo starts with; their points are already in the starting totals. */
const STARTING_BADGES: readonly string[] = ["ontime"];

function buildBadges(state: AppState, locale: Locale): Badge[] {
  const got: Record<string, boolean> = { answer: state.quizAnswered, ontime: true, streak: false, perfect: state.perfectQuiz };
  return ACHIEVEMENTS.map((code) => ({
    code,
    title: text(locale, `ach.${code}.title`),
    points: BADGE_POINTS,
    earned: got[code],
    awardedAt: null,
  }));
}

/**
 * The class leaderboard. Points come only from quizzes and achievements (decided 13 Oct 2026);
 * checking in to a lesson records attendance and earns nothing.
 */
function buildLeaderboard(state: AppState, locale: Locale): Leaderboard {
  const badges = buildBadges(state, locale).filter((b) => b.earned && !STARTING_BADGES.includes(b.code)).length;
  // A tie goes to the student, so reaching a classmate's points is enough to pass them.
  const sorted = LEADERBOARD.map((l) => (l.me ? { ...l, points: l.points + state.quizPoints + badges * BADGE_POINTS } : l)).sort(
    (a, b) => b.points - a.points || Number(!!b.me) - Number(!!a.me),
  );
  const rows: LeaderboardRow[] = sorted.map((l, i) => ({
    studentId: l.me ? "student-marko" : l.id,
    name: l.name[locale],
    points: l.points,
    rank: i + 1,
    isMe: !!l.me,
  }));
  return { scope: "class", season: null, rows };
}

/** The alerts a student starts with. A notice the student has read, or one that is only a record, has a read time. */
function buildNotifications(state: AppState, locale: Locale): Notification[] {
  const subject = (id: SubjectId) => text(locale, `subj.${id}`);
  return NOTIFS.map((n): Notification => {
    const createdAt = new Date(n.when).getTime();
    // A late mark is a record of the student's own morning, listed but never news.
    const readAt = state.read.includes(n.id) || n.id === "n-late" ? createdAt : null;
    const base = { id: n.id, createdAt, readAt };
    const course = { courseId: n.subject, subjectId: n.subject, subjectName: subject(n.subject) };
    if (n.id === "n-math") {
      return { ...base, kind: "result_ready", payload: { ...course, sessionId: "session-math-1", right: 4, total: 5 } };
    }
    if (n.id === "n-late") {
      return { ...base, kind: "marked_late", payload: { ...course, date: new Date("2026-10-08T08:12").getTime() } };
    }
    return {
      ...base,
      kind: "generic",
      payload: { ...course, title: text(locale, `notif.${n.id}.title`), body: text(locale, `notif.${n.id}.body`) },
    };
  });
}

export function createMockClient(source: MockSource): ApiClient {
  const { state, locale, writable } = source;
  const write = <T>(fn: () => T): T => {
    // The server render reads the defaults and must never change them.
    if (!writable) throw new ApiError("unknown", { message: "the mock is read-only here" });
    return fn();
  };
  /** What the API does with a call from a student who is not signed in (spec 11, FR-AUTH-06). */
  const needSignIn = () => {
    if (!state().signedIn) throw new ApiError(state().endedElsewhere ? "signed_in_elsewhere" : "unauthenticated");
  };
  /** A call that needs a signed-in student. */
  const authed = <T>(fn: () => T): SettledPromise<T> =>
    run(() => {
      needSignIn();
      return fn();
    });
  const me = () => {
    needSignIn();
    return buildStudent(state(), locale());
  };

  return {
    startSignIn: ({ schoolEmail }) => run(() => startMockSignIn(schoolEmail)),
    completeSignIn: ({ schoolEmail, code }) =>
      run(() =>
        write(() => {
          verifyMockCode(schoolEmail, code);
          actions.signIn();
          return me();
        }),
      ),
    signOut: () => run(() => write(() => actions.signOut())),
    getMe: () => run(me),

    updateProfile: ({ displayName }: ProfileUpdate) =>
      authed(() =>
        write(() => {
          // The API refuses what the editor never lets through (BR-STU-01); null goes back to the school account's name.
          const name = displayName === null ? null : cleanName(displayName);
          if (name !== null && nameError(name)) throw new ApiError("validation_failed");
          actions.setProfile({ ...state().profile, name });
          return me();
        }),
      ),
    setPhoto: ({ preview }: PhotoUpload) =>
      authed(() => write(() => (actions.setProfile({ ...state().profile, photo: preview }), me()))),
    removePhoto: () => authed(() => write(() => (actions.setProfile({ ...state().profile, photo: null }), me()))),
    updateSettings: (update: SettingsUpdate) =>
      authed(() =>
        write(() => {
          if (update.notificationsOn !== undefined) actions.setNotificationsOn(update.notificationsOn);
          if (update.locale !== undefined) setLocale(update.locale);
          return me();
        }),
      ),

    listCourses: () => authed(() => buildCourses(locale())),
    getAttendance: () => authed(() => buildAttendance(state(), locale())),
    listResults: (courseId?: Id) => authed(() => buildResults(state(), locale()).filter((r) => !courseId || r.courseId === courseId)),
    listTopics: () => authed(() => []),
    getLeaderboard: () => authed(() => buildLeaderboard(state(), locale())),
    listBadges: () => authed(() => buildBadges(state(), locale())),

    listNotifications: () => authed(() => buildNotifications(state(), locale())),
    markNotificationsRead: (ids) =>
      authed(() =>
        write(() => {
          const all = buildNotifications(state(), locale()).map((n) => n.id);
          const target = ids === "all" ? all : ids;
          // One state change for the lot, as the demo's mark-all always was.
          if (target.length === 1) actions.markRead(target[0]);
          else actions.markAllRead(target);
        }),
      ),

    listPracticeSets: () => authed(() => []),
    submitPracticeAnswers: () => fail(new ApiError("not_found")),

    joinSession: (input: JoinInput) =>
      authed(() => write(() => joinMock("token" in input ? input.token : input.shortCode, locale()))),

    getStudentState: (sessionId: Id) =>
      authed((): StudentSessionState => {
        const session = mockSessionFor(sessionId);
        if (!session) throw new ApiError("not_found");
        return session.studentState();
      }),

    submitAnswer: (sessionId: Id, answer: AnswerInput) =>
      authed((): AnswerReceipt => {
        const session = mockSessionFor(sessionId);
        if (!session) throw new ApiError("not_found");
        return write(() => session.submit(answer));
      }),

    subscribe: (listener) => {
      const stops = [subscribeStore(listener), subscribeLocale(listener)];
      return () => stops.forEach((stop) => stop());
    },
  };
}

/** The client the app uses in the browser, over the saved state. */
export const mockClient = createMockClient({ state: getState, locale: getLocale, writable: true });

/**
 * The client the server render and the hydrating render use: the demo's defaults, read-only, as a
 * student who is in (whether this phone's student is signed in is not known until it hydrates, and the
 * shell draws no screen until then).
 */
const SERVER_STATE: AppState = { ...DEFAULT_STATE, signedIn: true };
export const mockServerClient = createMockClient({ state: () => SERVER_STATE, locale: () => "mk", writable: false });
