"use client";

import { useCallback, useLayoutEffect, useMemo, useState } from "react";
import { loadFeed, resetFeed } from "../feed";
import { setLocale as setLocalLocale, useLocale } from "../locale";
import { forgetSets, loadSets } from "../practice-cache";
import { OUTBOX_STUDENT_KEY } from "../session/outbox-store";
import { forgetSession, recallJoin, recallSession, rememberSession } from "../session/resume";
import { client, demoOnly } from "./index";
import type { SettledPromise } from "./client";
import { toApiError, type ApiError } from "./errors";
import { endSession, onSessionEnd, useSessionEnd, type SessionEnd } from "./session";
import { amend, change, invalidate, mapQuery, resetQueries, seed, useQuery, type Query } from "./query";
import type {
  AttendanceSummary,
  Badge,
  Course,
  DataSummary,
  Id,
  JoinedSession,
  JoinResult,
  Leaderboard,
  LeaderboardRow,
  LeaderboardScope,
  Locale,
  Notification,
  PhotoUpload,
  PracticeSet,
  SessionResult,
  Student,
  SignInRedirect,
  StudentSignIn,
  TopicProgress,
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

/** The results of finished lessons, newest first; the topics the student has been tested on; the practice sets the teacher sent. */
export const useTopics = (): Query<TopicProgress[]> => useQuery("topics", (c) => c.listTopics());

/** The mock answers at once; the live API's sets are kept on the phone, so a set can still be opened with no signal. */
export const usePracticeSets = (): Query<PracticeSet[]> =>
  useQuery("practice", (c) => (demoOnly ? c.listPracticeSets() : loadSets(c)));

/** What the server holds about the student, as counts, for the "Your data" screen (PROPOSED `GET /me/data-summary`). */
export const useDataSummary = (): Query<DataSummary> => useQuery("data-summary", (c) => c.getDataSummary());

export const useBadges = (): Query<Badge[]> => useQuery("badges", (c) => c.listBadges());

/** The Alerts feed, newest first: the newest page, and the older ones the student has asked for (feed.ts). */
export const useNotifications = (): Query<Notification[]> => useQuery("notifications", (c) => loadFeed(c));

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

/** One finished session's result by id, or null when the list does not have it (yet). */
export function useResult(sessionId: Id): Query<SessionResult | null> {
  const q = useResults();
  return useMemo(() => mapQuery(q, (all) => all.find((r) => r.sessionId === sessionId) ?? null), [q, sessionId]);
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
      // The outbox's student is only a hint for the "answers saved" count; the answers themselves stay for the next sign-in.
      if (key.startsWith("teacheraid-shown-") || key === "teacheraid-achievements-seen" || key === OUTBOX_STUDENT_KEY) window.localStorage.removeItem(key);
    }
    window.sessionStorage.removeItem("teacheraid-home-rise");
    forgetSession();
  } catch {
    // blocked storage: nothing was kept
  }
}

// Whatever ends a session, nothing the student saw stays to be shown to the next one.
onSessionEnd(() => {
  resetQueries();
  resetFeed();
  forgetStudent();
  forgetSets();
});

/** F-02: the provider the student chose. Answers with where to send the browser; the student comes back signed in, to a page loaded afresh. */
export const startSignIn = (input: StudentSignIn): Promise<SignInRedirect> => client.startSignIn(input);

const beforeSignOut = new Set<() => Promise<void>>();

/**
 * Run something while the student is still signed in, just before they sign out by choice: the push subscription is
 * removed from the API here, which needs the session that the sign-out is about to end. A failure never stops the sign-out.
 */
export function onBeforeSignOut(cb: () => Promise<void>) {
  beforeSignOut.add(cb);
  return () => {
    beforeSignOut.delete(cb);
  };
}

/** Run what has to be done while the student is still signed in (see `onBeforeSignOut`). Never throws. */
export const releaseDevice = () => Promise.all([...beforeSignOut].map((cb) => cb().catch(() => {}))).then(() => undefined);

export async function signOut(): Promise<void> {
  await releaseDevice();
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
 * the API after when someone is signed in.
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

  return { locale, notificationsOn, setLocale };
}

/**
 * Save the notifications switch (`notifications_on`, FR-NOT-03). It shows at once and is put back if the API refuses. Turning
 * notifications on or off for this phone is lib/app/push's job, which calls this as one of its steps.
 */
export async function saveNotificationsOn(on: boolean): Promise<void> {
  const before = amend<Student>("me", (me) => ({ ...me, settings: { ...me.settings, notificationsOn: on } }));
  try {
    seed("me", await change((c) => c.updateSettings({ notificationsOn: on })));
  } catch (e) {
    if (before) seed("me", before);
    throw toApiError(e);
  }
}

/**
 * The student saw the privacy notice and terms of this version and tapped Continue (PROPOSED `POST /me/acknowledgements`). The
 * student the API answers with replaces the cached one, so the notice screen gives way at once.
 */
export async function acknowledgeNotice(version: string): Promise<void> {
  seed("me", await change((c) => c.acknowledgeNotice(version)));
}

// ---- Notifications ----------------------------------------------------------------------------------------------

/**
 * Mark alerts read. The feed shows them read at once, as the student expects of a tap, and is read again from the server
 * after: that settles it if the server disagreed, and puts it back if the call failed.
 */
export async function markNotificationsRead(ids: Id[] | "all"): Promise<void> {
  const at = Date.now();
  amend<Notification[]>("notifications", (all) =>
    all.map((n) => (n.readAt === null && (ids === "all" || ids.includes(n.id)) ? { ...n, readAt: at } : n)),
  );
  try {
    await change((c) => c.markNotificationsRead(ids), ["notifications"]);
  } catch (e) {
    invalidate("notifications");
    throw e;
  }
}

// ---- Joining a session -------------------------------------------------------------------------------------------

export type JoinState =
  | { status: "joining" }
  | { status: "joined"; join: JoinedSession }
  | { status: "failed"; error: ApiError };

/** Joins started by the scanner, so the screen it opens carries on from the answer instead of asking again. */
const started = new Map<string, Promise<JoinResult>>();

const joinNow = (code: string): Promise<JoinResult> => {
  const p = client.joinSession({ token: code });
  // Joining is the attendance, so the lists that show it are stale from here, as the mock's store already knows.
  void p.then(
    (join) => {
      rememberSession(code, join.session);
      invalidate("attendance", "notifications");
    },
    () => {},
  );
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
 * read before the first paint, so there is no frame between the code and the quiz. A code the API
 * calls expired that this tab joined with earlier is a page reload mid-lesson (the code rotates every
 * 30 seconds): the student is already in, so the session is read back instead of refused.
 * `retry` asks again, for a failure that was only the network.
 */
export function useJoinSession(code: string, enabled: boolean): JoinState & { retry: () => void } {
  const [state, setState] = useState<JoinState>({ status: "joining" });
  const [attempt, setAttempt] = useState(0);

  useLayoutEffect(() => {
    if (!enabled) return;
    let current = true;
    const handed = attempt === 0 ? started.get(code) : undefined;
    started.delete(code);
    const p = handed ?? joinNow(code);
    const apply = (s: JoinState) => current && setState(s);
    const fail = (e: unknown) => {
      const error = toApiError(e);
      // No connection, but this tab joined this lesson before (a reload with the signal gone): open it and wait
      // for the signal, so the answer the student saved is on screen and not behind a failed join.
      const offline = error.code === "network" ? recallJoin(code) : null;
      if (offline) return apply({ status: "joined", join: offline });
      const earlier = error.code === "token_expired" ? recallSession(code) : null;
      if (!earlier) return apply({ status: "failed", error });
      client.getStudentState(earlier).then(
        (snapshot) => apply({ status: "joined", join: { session: snapshot.session, attendance: null, serverNow: snapshot.serverNow } }),
        () => apply({ status: "failed", error }),
      );
    };
    const settled = (p as Partial<SettledPromise<JoinResult>>).settled;
    if (settled) {
      if (settled.ok) apply({ status: "joined", join: settled.value });
      else fail(settled.error);
    } else {
      p.then((join) => apply({ status: "joined", join }), fail);
    }
    return () => {
      current = false;
    };
  }, [code, enabled, attempt]);

  const retry = useCallback(() => {
    setState({ status: "joining" });
    setAttempt((n) => n + 1);
  }, []);
  return { ...state, retry };
}
