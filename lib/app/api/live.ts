import type { ApiClient } from "./client";
import { ApiError, parseErrorResponse } from "./errors";
import { apiBase } from "./config";
import * as wire from "./wire";
import type { Id, LeaderboardScope } from "./types";

/**
 * The live adapter: fetch against NEXT_PUBLIC_API_URL under `/api/v1`, errors parsed into stable
 * codes, bodies mapped by wire.ts. The paths are spec 11.1; the response shapes are the PROPOSED
 * ones of spec 11.3.
 *
 * Sign-in is email first and the stage after the email is the server's to name (OPEN-01): the
 * proposed `/auth/student/start` and `/auth/student/verify` of spec 11.1. The session is an httpOnly
 * cookie the API sets; every request goes out with cookies (`credentials: "include"`) and no token
 * header, so the app never holds the session token. If OPEN-01 ends in bearer tokens, `request` is the
 * one place that changes.
 */

const TIMEOUT_MS = 15_000;

type Options = {
  query?: Record<string, string | undefined>;
  /** A JSON body, or a Blob sent as it is. */
  body?: unknown;
  /** Let the request finish even if the page is hidden or closed on the way (a small body only). */
  keepalive?: boolean;
};

async function request<T>(method: string, path: string, { query, body, keepalive }: Options = {}): Promise<T> {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined) params.set(k, v);
  const url = `${apiBase}${path}${params.size ? `?${params}` : ""}`;

  const headers: Record<string, string> = { Accept: "application/json" };
  let payload: BodyInit | undefined;
  if (body instanceof Blob) {
    headers["Content-Type"] = body.type || "application/octet-stream";
    payload = body;
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }

  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, { method, headers, body: payload, credentials: "include", signal: abort.signal, keepalive });
  } catch (e) {
    // Offline, blocked, refused or timed out: the app treats them alike.
    throw new ApiError("network", { cause: e });
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw await parseErrorResponse(res);
  if (res.status === 204) return undefined as T;
  try {
    return (await res.json()) as T;
  } catch (e) {
    throw new ApiError("invalid_response", { status: res.status, cause: e });
  }
}

export function createLiveClient(): ApiClient {
  /** The student after a change, so the hook can show the new profile without a second trip. */
  const meAfter = async (call: Promise<unknown>) => {
    await call;
    return wire.student(await request<wire.WireStudent>("GET", "/me"));
  };

  return {
    startSignIn: async ({ schoolEmail, returnTo }) =>
      wire.signInChallenge(
        await request<wire.WireSignInChallenge>("POST", "/auth/student/start", {
          body: { school_email: schoolEmail, ...(returnTo ? { return_to: returnTo } : {}) },
        }),
      ),
    completeSignIn: async ({ schoolEmail, code }) =>
      wire.student(await request<wire.WireStudent>("POST", "/auth/student/verify", { body: { school_email: schoolEmail, code } })),
    signOut: () => request<void>("POST", "/auth/logout"),
    getMe: async () => wire.student(await request<wire.WireStudent>("GET", "/me")),

    updateProfile: ({ displayName }) => meAfter(request("PATCH", "/me/profile", { body: { display_name: displayName } })),
    setPhoto: ({ blob }) => meAfter(request("PUT", "/me/profile/photo", { body: blob })),
    removePhoto: () => meAfter(request("DELETE", "/me/profile/photo")),
    updateSettings: (update) => meAfter(request("PATCH", "/me/settings", { body: wire.settingsBody(update) })),

    listCourses: async () => (await request<wire.WireCourse[]>("GET", "/me/courses")).map(wire.course),
    getAttendance: async () => wire.attendance(await request<wire.WireAttendance>("GET", "/me/attendance")),
    listResults: async (courseId?: Id) =>
      (await request<wire.WireResult[]>("GET", "/me/results", { query: { course: courseId } })).map(wire.result),
    listTopics: async () => (await request<wire.WireTopic[]>("GET", "/me/topics")).map(wire.topic),
    getLeaderboard: async (scope: LeaderboardScope = "class") =>
      wire.leaderboard(await request<wire.WireLeaderboard>("GET", "/me/leaderboard", { query: { scope } })),
    listBadges: async () => (await request<wire.WireBadge[]>("GET", "/me/badges")).map(wire.badge),

    listNotifications: async (page) =>
      (
        await request<wire.WireNotification[]>("GET", "/me/notifications", {
          query: { limit: page?.limit === undefined ? undefined : String(page.limit), before: page?.before },
        })
      ).map(wire.notification),
    markNotificationsRead: (ids) =>
      request<void>("POST", "/me/notifications/read", { body: ids === "all" ? { all: true } : { ids } }),

    setPushToken: (registration) => request<void>("PUT", "/me/push-token", { body: wire.pushTokenBody(registration) }),
    removePushToken: () => request<void>("DELETE", "/me/push-token"),

    listPracticeSets: async () => (await request<wire.WirePracticeSet[]>("GET", "/me/practice-sets")).map(wire.practiceSet),
    submitPracticeAnswers: async (id, answers) =>
      wire.practiceAttempt(
        await request<wire.WirePracticeAttempt>("POST", `/practice-sets/${encodeURIComponent(id)}/answers`, {
          body: { answers: answers.map((a) => ({ question_id: a.questionId, response: a.response })) },
        }),
      ),

    joinSession: async (input) =>
      wire.join(
        await request<wire.WireJoin>("POST", "/sessions/join", {
          body: "token" in input ? { token: input.token } : { short_code: input.shortCode },
        }),
      ),
    getStudentState: async (sessionId) =>
      wire.studentState(await request<wire.WireStudentState>("GET", `/sessions/${encodeURIComponent(sessionId)}/student-state`)),
    submitAnswer: async (sessionId, answer) =>
      wire.answerReceipt(
        await request<wire.WireAnswerReceipt>("POST", `/sessions/${encodeURIComponent(sessionId)}/answers`, {
          body: wire.answerBody(answer),
        }),
      ),
    submitVote: async (sessionId, vote) =>
      wire.answerReceipt(
        await request<wire.WireAnswerReceipt>("POST", `/sessions/${encodeURIComponent(sessionId)}/opener/vote`, {
          body: wire.voteBody(vote),
        }),
      ),
    submitReason: async (sessionId, reason) =>
      wire.answerReceipt(
        await request<wire.WireAnswerReceipt>("POST", `/sessions/${encodeURIComponent(sessionId)}/opener/reason`, {
          body: wire.reasonBody(reason),
        }),
      ),
    submitAsk: async (sessionId, ask) =>
      wire.answerReceipt(
        await request<wire.WireAnswerReceipt>("POST", `/sessions/${encodeURIComponent(sessionId)}/anon-questions`, {
          body: wire.askBody(ask),
        }),
      ),
    // keepalive: a `lost` is often sent as the page is being hidden, and should still get there.
    sendFocusEvents: (sessionId, events) =>
      request<void>("POST", `/sessions/${encodeURIComponent(sessionId)}/focus-events`, { body: wire.focusBody(events), keepalive: true }),

    // Realtime (spec 11.2) arrives with the live session engine; until then nothing pushes changes.
    subscribe: () => () => {},
  };
}
