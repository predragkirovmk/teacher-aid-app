import type { TeacherApi } from "./client";
import { apiBase } from "./config";
import { ApiError, parseErrorResponse } from "./errors";
import {
  CONSOLE_EVENT_TYPES,
  PUBLIC_EVENT_TYPES,
  type ChannelEvent,
  type CourseDashboard,
  type CourseSummary,
  type OpenSession,
  type ConsoleSnapshot,
  type Lesson,
  type LessonDraft,
  type LessonSummary,
  type LibraryItem,
  type Me,
  type SourceCreated,
  type QuestionMedia,
} from "./types";

/**
 * The live adapter: `fetch` against NEXT_PUBLIC_API_BASE under `/api/v1`, JSON in and out, errors read
 * from the spec's envelope into stable codes (errors.ts). The paths are spec 11.1; the bodies are the PROPOSED
 * ones of types.ts. Nothing uses it until the backend exists.
 *
 * Two things must change before it is switched on, and are not done now:
 * - next.config.ts: the CSP's `connect-src` (and `img-src`, for question images) must list the API's origin;
 *   today they allow only 'self'.
 * - the API must allow this origin with credentials (CORS, spec 11.4); the session is an HttpOnly cookie, so
 *   every request goes out with `credentials: "include"` and the app never holds a token.
 */

/** Spec 11.4: a request that takes longer than this counts as being offline. */
const TIMEOUT_MS = 15_000;
/** The AI writes a lesson in minutes (US-T02), so generating and refining wait longer. */
const SLOW_TIMEOUT_MS = 180_000;

type Options = {
  /** A JSON body, or a FormData sent as it is (a file). */
  body?: unknown;
  timeout?: number;
};

async function request<T>(method: string, path: string, { body, timeout = TIMEOUT_MS }: Options = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  let payload: BodyInit | undefined;
  if (body instanceof FormData) {
    payload = body;
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }

  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), timeout);
  let res: Response;
  try {
    res = await fetch(`${apiBase}${path}`, { method, headers, body: payload, credentials: "include", signal: abort.signal });
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

const id = encodeURIComponent;

export function createLiveApi(): TeacherApi {
  const session = (sessionId: string) => `/sessions/${id(sessionId)}`;
  const question = (sessionId: string, sqId: string) => `${session(sessionId)}/questions/${id(sqId)}`;

  return {
    getMe: () => request<Me>("GET", "/me"),
    setFirstRunDone: async () => {
      await request<unknown>("PATCH", "/me", { body: { first_run_done: true } });
      return request<Me>("GET", "/me");
    },

    listCourses: () => request<CourseSummary[]>("GET", "/teacher/courses"),
    getDashboard: (courseId) => request<CourseDashboard>("GET", `/courses/${id(courseId)}/dashboard`),
    updateCourse: (courseId, patch) => request<CourseSummary>("PATCH", `/courses/${id(courseId)}`, { body: patch }),

    createSource: (input) => {
      if (input.kind === "typed") return request<SourceCreated>("POST", "/lessons/sources", { body: { text: input.text } });
      const form = new FormData();
      form.append("file", input.file);
      return request<SourceCreated>("POST", "/lessons/sources", { body: form });
    },
    generateLesson: (req) => request<LessonDraft>("POST", "/lessons/generate", { body: req, timeout: SLOW_TIMEOUT_MS }),
    getDraft: (draftId) => request<LessonDraft>("GET", `/lessons/drafts/${id(draftId)}`),
    refineDraft: (draftId, refinement) =>
      request<LessonDraft>("POST", `/lessons/drafts/${id(draftId)}/refine`, { body: { refinement }, timeout: SLOW_TIMEOUT_MS }),
    saveLesson: (req) => request<Lesson>("POST", "/lessons", { body: req }),
    uploadMedia: (file) => {
      const form = new FormData();
      form.append("file", file);
      return request<QuestionMedia>("POST", "/lessons/media", { body: form });
    },

    listLessons: () => request<LessonSummary[]>("GET", "/lessons"),
    getLesson: (lessonId) => request<Lesson>("GET", `/lessons/${id(lessonId)}`),
    updateLesson: (lessonId, req) => request<Lesson>("PUT", `/lessons/${id(lessonId)}`, { body: req }),
    deleteLesson: (lessonId) => request<void>("DELETE", `/lessons/${id(lessonId)}`),
    listLibrary: () => request<LibraryItem[]>("GET", "/library"),
    copyFromLibrary: (lessonId) => request<Lesson>("POST", `/library/${id(lessonId)}/copy`),

    createSession: (req) => request<ConsoleSnapshot>("POST", "/sessions", { body: req }),
    getOpenSession: () => request<OpenSession>("GET", "/sessions/open"),
    getConsole: (sessionId) => request<ConsoleSnapshot>("GET", `${session(sessionId)}/console`),
    getClassView: (sessionId) => request("GET", `${session(sessionId)}/class-view`),
    advance: (sessionId, req) => request<ConsoleSnapshot>("POST", `${session(sessionId)}/advance`, { body: req }),
    fireQuestion: (sessionId, sqId) => request<ConsoleSnapshot>("POST", `${question(sessionId, sqId)}/fire`),
    revealQuestion: (sessionId, sqId) => request<ConsoleSnapshot>("POST", `${question(sessionId, sqId)}/reveal`),
    skipQuestion: (sessionId, sqId) => request<ConsoleSnapshot>("POST", `${question(sessionId, sqId)}/skip`),
    fireAdhoc: (sessionId, req) => request<ConsoleSnapshot>("POST", `${session(sessionId)}/adhoc`, { body: req }),
    markNoDevice: (sessionId, studentId, req) =>
      request<ConsoleSnapshot>("POST", `${session(sessionId)}/attendance/${id(studentId)}/no-device`, { body: req }),
    markAnonAnswered: (sessionId, anonId) => request("PATCH", `${session(sessionId)}/anon-questions/${id(anonId)}`, { body: { answered: true } }),
    endSession: (sessionId) => request("POST", `${session(sessionId)}/end`),
    getReview: (sessionId) => request("GET", `${session(sessionId)}/review`),
    createPracticeSet: (sessionId) => request("POST", `${session(sessionId)}/practice-set`),
    getPracticeResults: (sessionId) => request("GET", `${session(sessionId)}/practice-set`),

    // Server-Sent Events with the session cookie (spec 11.4). Each message is `event: <type>` and a JSON body of 11.2.
    openChannel: (channel, onEvent) => {
      const source = new EventSource(`${apiBase}/realtime?channels=${encodeURIComponent(channel)}`, { withCredentials: true });
      const types = channel.endsWith(".console") ? CONSOLE_EVENT_TYPES : PUBLIC_EVENT_TYPES;
      for (const type of types) {
        source.addEventListener(type, (e) => {
          try {
            onEvent({ ...JSON.parse((e as MessageEvent<string>).data), type } as ChannelEvent);
          } catch {
            // A message that is not JSON is ignored: an event the app does not understand is never fatal (11.2).
          }
        });
      }
      return () => source.close();
    },

    // Nothing pushes changes until the realtime driver exists.
    subscribe: () => () => {},
  };
}
