"use client";

import { useCallback, useLayoutEffect, useMemo, useState } from "react";
import { setLocale as setLocalLocale, useLocale } from "../locale";
import type { QuizRun } from "../quiz";
import { client } from "./index";
import type { SettledPromise } from "./client";
import { toApiError, type ApiError } from "./errors";
import { endSession, onSessionEnd, startSession, useSessionEnd, type SessionEnd } from "./session";
import { change, invalidate, mapQuery, resetQueries, seed, useQuery, type Query } from "./query";
import type {
  AttendanceSummary,
  Badge,
  Course,
  Id,
  JoinResult,
  Leaderboard,
  LeaderboardRow,
  LeaderboardScope,
  Locale,
  Notification,
  PhotoUpload,
  SessionResult,
  Student,
  SignInChallenge,
  StudentSignIn,
  StudentSignInCode,
} from "./types";

export type { Query } from "./query";

/** The hooks screens use. Each reads one thing from the client and says whether it is loading, ready or failed. */

// ---- Reading --------------------------------------------------------------------------------------

export const useMe = (): Query<Student> => useQuery("me", (c) => c.getMe());

export const useCourses = (): Query<Course[]> => useQuery("courses", (c) => c.listCourses());

/** `enabled: false` for a screen that only wants the log in demo mode. */
export const useAttendance = (enabled = true): Query<AttendanceSummary> =>
  useQuery("attendance", (c) => c.getAttendance(), enabled);

export const useResults = (courseId?: Id): Query<SessionResult[]> =>
  useQuery(courseId ? `results:${courseId}` : "results", (c) => c.listResults(courseId));

export const useBadges = (): Query<Badge[]> => useQuery("badges", (c) => c.listBadges());

export const useNotifications = (): Query<Notification[]> => useQuery("notifications", (c) => c.listNotifications());

export const useLeaderboard = (scope: LeaderboardScope = "class"): Query<Leaderboard> =>
  useQuery(`leaderboard:${scope}`, (c) => c.getLeaderboard(scope));

// ---- Derived ----------------------------------------------------------------------------------------

/** One course, from the list of the student's courses. */
export function useCourse(id: Id): Query<Course | null> {
  const q = useCourses();
  return useMemo(() => mapQuery(q, (all) => all.find((c) => c.id === id) ?? null), [q, id]);
}

/** The newest finished session, or null when there is none yet. */
export function useLatestResult(): Query<SessionResult | null> {
  const q = useResults();
  return useMemo(() => mapQuery(q, (all) => all[0] ?? null), [q]);
}

export type Standings = {
  rows: LeaderboardRow[];
  me: LeaderboardRow;
  rank: number;
  /** The student just above, or null at the top. */
  above: LeaderboardRow | null;
};

/** The class leaderboard with the student's own place picked out. */
export function useStandings(): Query<Standings | null> {
  const q = useLeaderboard("class");
  return useMemo(
    () =>
      mapQuery(q, (board): Standings | null => {
        const index = board.rows.findIndex((r) => r.isMe);
        if (index < 0) return null;
        const me = board.rows[index];
        return { rows: board.rows, me, rank: me.rank, above: index > 0 ? board.rows[index - 1] : null };
      }),
    [q],
  );
}

/** Attendance with the change since a week ago, from the rounded figures a student would see. */
export function useAttendanceView(enabled = true): Query<AttendanceSummary & { change: number | null }> {
  const q = useAttendance(enabled);
  return useMemo(
    () => mapQuery(q, (a) => ({ ...a, change: a.percentWeekAgo === null ? null : a.percent - a.percentWeekAgo })),
    [q],
  );
}

// ---- Who is signed in -------------------------------------------------------------------------------------

export type AuthStatus = "loading" | "signedIn" | "signedOut" | "error";

/**
 * Signed in or out, as the API says: `GET /me` answers, or any call the app makes refuses with
 * `unauthenticated` or `signed_in_elsewhere` (session.ts watches them all).
 */
export function useAuth() {
  const me = useMe();
  const end = useSessionEnd();
  const code = me.error?.code;
  const ended: SessionEnd | null = end ?? (code === "unauthenticated" || code === "signed_in_elsewhere" ? code : null);
  const status: AuthStatus = ended
    ? "signedOut"
    : me.status === "ready"
      ? "signedIn"
      : me.status === "loading"
        ? "loading"
        : "error";
  return {
    status,
    /** Why a signed-out student is signed out (EC-AUTH-01): their own choice, another device, or no session. */
    reason: ended ?? undefined,
    me,
  };
}

/** Per-student things the app keeps on the phone for its own comfort; none of it may meet the next student. */
function forgetStudent() {
  try {
    for (const key of Object.keys(window.localStorage)) {
      if (key.startsWith("teacheraid-shown-") || key === "teacheraid-achievements-seen") window.localStorage.removeItem(key);
    }
    window.sessionStorage.removeItem("teacheraid-home-rise");
  } catch {
    // blocked storage: nothing was kept
  }
}

// Whatever ends a session, nothing the student saw stays to be shown to the next one.
onSessionEnd(() => {
  resetQueries();
  forgetStudent();
});

/** F-02, first stage: the school email. Answers with what comes next (a code to type, or a redirect). */
export const startSignIn = (input: StudentSignIn): Promise<SignInChallenge> => client.startSignIn(input);

/** F-02, last stage: the code from the mailbox. The student is signed in, on a clean cache. */
export async function completeSignIn(input: StudentSignInCode): Promise<Student> {
  const student = await change((c) => c.completeSignIn(input));
  startSession();
  resetQueries();
  seed("me", student);
  return student;
}

export async function signOut(): Promise<void> {
  try {
    await change((c) => c.signOut());
  } catch (e) {
    // Already out is what was asked for; a failure to reach the server leaves the student signed in, and says so.
    const { code } = toApiError(e);
    if (code !== "unauthenticated" && code !== "signed_in_elsewhere") throw e;
  }
  endSession("signed_out");
}

// ---- Profile and settings -----------------------------------------------------------------------------------

export type ProfileChange = {
  /** The new display name, null to go back to the school account's name, undefined to leave it. */
  displayName?: string | null;
  /** The new photo, null to remove it, undefined to leave it. */
  photo?: PhotoUpload | null;
};

/** Save what changed on the profile, in the order the endpoints take it. */
export async function saveProfile({ displayName, photo }: ProfileChange): Promise<Student | null> {
  let latest: Student | null = null;
  if (displayName !== undefined) latest = await change((c) => c.updateProfile({ displayName }));
  if (photo !== undefined) latest = await change((c) => (photo ? c.setPhoto(photo) : c.removePhoto()));
  if (latest) seed("me", latest);
  return latest;
}

/**
 * The language is the phone's own setting first, so it changes at once and offline, and is told to
 * the API after when someone is signed in. Notifications are the API's setting, shown at once and
 * put back if the API refuses.
 */
export function useSettings() {
  const locale = useLocale();
  const me = useMe();
  const notificationsOn = me.data?.settings.notificationsOn ?? true;

  const setLocale = useCallback(
    (next: Locale) => {
      setLocalLocale(next);
      if (me.status === "ready") void change((c) => c.updateSettings({ locale: next }), ["me"]).catch(() => {});
    },
    [me.status],
  );

  const setNotificationsOn = useCallback(
    async (on: boolean) => {
      const before = me.data;
      if (before) seed("me", { ...before, settings: { ...before.settings, notificationsOn: on } });
      try {
        seed("me", await change((c) => c.updateSettings({ notificationsOn: on })));
      } catch (e) {
        if (before) seed("me", before);
        throw toApiError(e);
      }
    },
    [me.data],
  );

  return { locale, notificationsOn, setLocale, setNotificationsOn };
}

// ---- Notifications ----------------------------------------------------------------------------------------------

export const markNotificationsRead = (ids: Id[] | "all") => change((c) => c.markNotificationsRead(ids), ["notifications"]);

// ---- Joining a session -------------------------------------------------------------------------------------------

export type JoinState =
  | { status: "joining" }
  | { status: "joined"; join: JoinResult }
  | { status: "failed"; error: ApiError };

/** Joins started by the scanner, so the screen it opens carries on from the answer instead of asking again. */
const started = new Map<string, Promise<JoinResult>>();

const joinNow = (code: string): Promise<JoinResult> => {
  const p = client.joinSession({ token: code });
  // Joining is the attendance, so the lists that show it are stale from here, as the mock's store already knows.
  void p.then(() => invalidate("attendance", "notifications"), () => {});
  return p;
};

/** Join by the code a QR carried. Used by the scanner so it can show a failure where it stands. */
export function startJoin(code: string): Promise<JoinResult> {
  const p = joinNow(code);
  started.set(code, p);
  // A join that failed is not worth handing on: the next screen asks again.
  p.catch(() => started.delete(code));
  return p;
}

/**
 * Join the session a code opens, once the student is signed in. An adapter that answers at once is
 * read before the first paint, so there is no frame between the code and the quiz.
 */
export function useJoinSession(code: string, enabled: boolean): JoinState {
  const [state, setState] = useState<JoinState>({ status: "joining" });

  useLayoutEffect(() => {
    if (!enabled) return;
    let current = true;
    const handed = started.get(code);
    started.delete(code);
    const p = handed ?? joinNow(code);
    const apply = (s: JoinState) => current && setState(s);
    const settled = (p as Partial<SettledPromise<JoinResult>>).settled;
    if (settled) {
      apply(settled.ok ? { status: "joined", join: settled.value } : { status: "failed", error: toApiError(settled.error) });
    } else {
      p.then(
        (join) => apply({ status: "joined", join }),
        (error) => apply({ status: "failed", error: toApiError(error) }),
      );
    }
    return () => {
      current = false;
    };
  }, [code, enabled]);

  return state;
}

/* eslint-disable @typescript-eslint/no-require-imports */
const mockQuiz =
  process.env.NEXT_PUBLIC_API_MODE === "live" ? null : (require("./mock/quiz") as typeof import("./mock/quiz"));

/**
 * What the quiz screen draws, from the session a join opened. Only the demo's session driver
 * produces it so far (the teacher, the timer and the classmates are played in the browser), so the
 * quiz screen is only reached in demo mode; the live session engine of the next step replaces this
 * with one built from the server's snapshots and events.
 */
export function useQuizRun(join: JoinResult): QuizRun {
  return mockQuiz!.useMockQuizRun(join.session.courseId);
}
