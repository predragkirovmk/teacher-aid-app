import type { TeacherApi } from "./client";
import { apiBase } from "./config";
import { ApiError, parseErrorResponse } from "./errors";
import { connectSse } from "./sse";
import {
  CLASS_EVENT_TYPES,
  CONSOLE_EVENT_TYPES,
  PUBLIC_EVENT_TYPES,
  type ChannelEvent,
  type ClassViewSnapshot,
  type CourseDashboard,
  type CourseSummary,
  type OpenSession,
  type ConsoleSnapshot,
  type DraftSummary,
  type Lesson,
  type LessonDraft,
  type LessonSummary,
  type LibraryItem,
  type Me,
  type SignInRedirect,
  type SourceCreated,
  type QuestionMedia,
} from "./types";

/**
 * The live adapter: `fetch` against NEXT_PUBLIC_API_URL under `/api/v1`, JSON in and out, errors read
 * from the spec's envelope into stable codes (errors.ts). The paths are spec 11.1; the bodies are the PROPOSED
 * ones of types.ts. Nothing uses it until the backend exists.
 *
 * Signing in is a full-page redirect and not a fetch: `POST /auth/start` answers with the provider's address and the page
 * navigates to it, so the CSP needs nothing for it (navigation is not `connect-src`). The provider's callback sets the
 * cookie and brings the browser back to `return_to`, a path of this app.
 *
 * The API's origin is in the teacher policy's `connect-src` and `img-src` (next.config.ts) when NEXT_PUBLIC_API_MODE is "live". The API must
 * allow this origin with credentials (CORS, spec 11.4); the session is an HttpOnly cookie, so every request goes out with
 * `credentials: "include"` and the app never holds a token.
 */

/** Spec 11.4: a request that takes longer than this counts as being offline. */
const TIMEOUT_MS = 15_000;
/** A 20 MB document takes a while on a school's connection (BR-LES-09). The AI's work is not a request any more: it is a draft that is polled. */
const SLOW_TIMEOUT_MS = 180_000;

type Options = {
  /** A JSON body, or a FormData sent as it is (a file). */
  body?: unknown;
  timeout?: number;
  /** The call may finish after the page is gone: the teacher's last edits, sent as the page closes. Only for small bodies. */
  keepalive?: boolean;
  /** The screen stopped waiting (Cancel, or the connection dropped): the request is abandoned and counts as a network failure. */
  signal?: AbortSignal;
};

async function request<T>(method: string, path: string, { body, timeout = TIMEOUT_MS, keepalive, signal }: Options = {}): Promise<T> {
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
  const stop = () => abort.abort();
  if (signal?.aborted) stop();
  else signal?.addEventListener("abort", stop, { once: true });
  let res: Response;
  try {
    res = await fetch(`${apiBase}${path}`, { method, headers, body: payload, credentials: "include", keepalive, signal: abort.signal });
  } catch (e) {
    // Offline, blocked, refused or timed out: the app treats them alike.
    throw new ApiError("network", { cause: e });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", stop);
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
    startSignIn: (req) => request<SignInRedirect>("POST", "/auth/start", { body: req }),
    signOut: () => request<void>("POST", "/auth/logout"),

    getMe: () => request<Me>("GET", "/me"),
    setFirstRunDone: async () => {
      await request<unknown>("PATCH", "/me", { body: { first_run_done: true } });
      return request<Me>("GET", "/me");
    },

    listCourses: () => request<CourseSummary[]>("GET", "/teacher/courses"),
    getDashboard: (courseId) => request<CourseDashboard>("GET", `/courses/${id(courseId)}/dashboard`),
    updateCourse: (courseId, patch) => request<CourseSummary>("PATCH", `/courses/${id(courseId)}`, { body: patch }),

    createSource: (input, { signal } = {}) => {
      if (input.kind === "typed") return request<SourceCreated>("POST", "/lessons/sources", { body: { text: input.text }, signal });
      const form = new FormData();
      form.append("file", input.file);
      return request<SourceCreated>("POST", "/lessons/sources", { body: form, timeout: SLOW_TIMEOUT_MS, signal });
    },
    // The AI's work is a job: these answer at once with the draft, `pending` (BR-LES-09), and the screen asks for it again.
    generateLesson: (req, { signal } = {}) => request<LessonDraft>("POST", "/lessons/generate", { body: req, signal }),
    getDraft: (draftId) => request<LessonDraft>("GET", `/lessons/drafts/${id(draftId)}`),
    listDrafts: () => request<DraftSummary[]>("GET", "/lessons/drafts"),
    updateDraft: (draftId, patch) => request<LessonDraft>("PATCH", `/lessons/drafts/${id(draftId)}`, { body: patch, keepalive: true }),
    deleteDraft: (draftId) => request<void>("DELETE", `/lessons/drafts/${id(draftId)}`),
    retryDraft: (draftId) => request<LessonDraft>("POST", `/lessons/drafts/${id(draftId)}/retry`),
    refineDraft: (draftId, refinement) => request<LessonDraft>("POST", `/lessons/drafts/${id(draftId)}/refine`, { body: { refinement } }),
    startEditing: (lessonId) => request<LessonDraft>("POST", `/lessons/${id(lessonId)}/drafts`),
    saveLesson: (req) => request<Lesson>("POST", "/lessons", { body: req }),
    uploadMedia: (file) => {
      const form = new FormData();
      form.append("file", file);
      return request<QuestionMedia>("POST", "/lessons/media", { body: form, timeout: SLOW_TIMEOUT_MS });
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
    getClassView: (sessionId) => request<ClassViewSnapshot>("GET", `${session(sessionId)}/class-view`),
    advance: (sessionId, req) => request<ConsoleSnapshot>("POST", `${session(sessionId)}/advance`, { body: req }),
    fireQuestion: (sessionId, sqId) => request<ConsoleSnapshot>("POST", `${question(sessionId, sqId)}/fire`),
    revealQuestion: (sessionId, sqId) => request<ConsoleSnapshot>("POST", `${question(sessionId, sqId)}/reveal`),
    skipQuestion: (sessionId, sqId) => request<ConsoleSnapshot>("POST", `${question(sessionId, sqId)}/skip`),
    fireAdhoc: (sessionId, req) => request<ConsoleSnapshot>("POST", `${session(sessionId)}/adhoc`, { body: req }),
    markNoDevice: (sessionId, studentId, req) =>
      request<ConsoleSnapshot>("POST", `${session(sessionId)}/attendance/${id(studentId)}/no-device`, { body: req }),
    clearNoDevice: (sessionId, studentId) => request<ConsoleSnapshot>("DELETE", `${session(sessionId)}/attendance/${id(studentId)}/no-device`),
    markAnonAnswered: (sessionId, anonId, answered) =>
      request("PATCH", `${session(sessionId)}/anon-questions/${id(anonId)}`, { body: { answered } }),
    endSession: (sessionId) => request("POST", `${session(sessionId)}/end`),
    getReview: (sessionId) => request("GET", `${session(sessionId)}/review`),
    createPracticeSet: (sessionId) => request("POST", `${session(sessionId)}/practice-set`),
    getPracticeResults: (sessionId) => request("GET", `${session(sessionId)}/practice-set`),

    // Server-Sent Events with the session cookie (spec 11.4), kept open by sse.ts. Each message is `event: <type>` and a JSON body of 11.2.
    openChannel: (channel, { onEvent, onStatus }) =>
      connectSse({
        url: `${apiBase}/realtime?channels=${encodeURIComponent(channel)}`,
        types: channel.endsWith(".console") ? CONSOLE_EVENT_TYPES : channel.endsWith(".class") ? CLASS_EVENT_TYPES : PUBLIC_EVENT_TYPES,
        onEvent: (type, body) => onEvent({ ...(body as object), type } as ChannelEvent),
        onStatus: (status) => onStatus?.(status),
      }),

    // What changes behind the app's back arrives on the realtime stream, not here.
    subscribe: () => () => {},
  };
}
