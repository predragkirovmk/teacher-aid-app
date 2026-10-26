import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import type { AlertItem } from "@/lib/app/alerts";
import { translate } from "@/lib/app/i18n";
import { safeNext } from "@/lib/app/signin";

// alerts.ts reads the feed through hooks; only its copy and links are under test here.
vi.mock("@/lib/app/api", () => ({ demoOnly: false }));
vi.mock("@/lib/app/api/hooks", () => ({ useAttendance: vi.fn(), useNotifications: vi.fn() }));
const { alertCopy } = await import("@/lib/app/alerts");

/**
 * The push payload and what the worker does with it: reading the payload, the screen a tap opens, and the worker's
 * handlers for `push` and `notificationclick`, run against a stand-in for the worker's scope.
 */
type PushApi = {
  parse(raw: unknown): { id: string; kind: string; title: string; body: string; lang: string; link: string; icon: string; badge: string };
  options(n: ReturnType<PushApi["parse"]>): Record<string, unknown>;
  deepLink(kind: string, payload: unknown): string;
  appPath(path: unknown): string | null;
  withAlert(link: string, id: string): string;
  pickWindow(windows: { url: string; focused?: boolean; visibilityState?: string }[], origin: string): unknown;
  FALLBACK_BODY: string;
};
const Push = createRequire(import.meta.url)("../../public/app-push.js") as PushApi;

const ORIGIN = "https://app.example";
const sw = readFileSync(new URL("../../public/app-sw.js", import.meta.url), "utf8");
const pushSource = readFileSync(new URL("../../public/app-push.js", import.meta.url), "utf8");

describe("reading a push payload", () => {
  const full = {
    v: 1,
    id: "n-81",
    kind: "practice_set_sent",
    locale: "en",
    title: "Practice questions: Mathematics",
    body: "Your teacher sent practice questions.",
    payload: { course_id: "c-math", subject_id: "math", practice_set_id: "ps-12" },
  };

  it("takes the words, the alert's id and the language from the payload", () => {
    expect(Push.parse(full)).toMatchObject({
      id: "n-81",
      kind: "practice_set_sent",
      title: "Practice questions: Mathematics",
      body: "Your teacher sent practice questions.",
      lang: "en",
      link: "/app/practice/ps-12",
    });
  });

  it("is in Macedonian unless it says English", () => {
    expect(Push.parse({ ...full, locale: undefined }).lang).toBe("mk");
    expect(Push.parse({ ...full, locale: "fr" }).lang).toBe("mk");
  });

  it("always has something to show, whatever came in", () => {
    for (const raw of [null, undefined, "text", 7, [], {}, { title: 5, body: {} }]) {
      const n = Push.parse(raw);
      expect(n.title, JSON.stringify(raw)).toBe("TeacherAid");
      expect(n.body).toBe(Push.FALLBACK_BODY);
      expect(n.link).toBe("/app/notifications");
    }
  });

  it("keeps a title with no body as it is", () => {
    expect(Push.parse({ title: "Hello" })).toMatchObject({ title: "Hello", body: "" });
  });

  it("cuts what is too long to show", () => {
    const n = Push.parse({ title: "t".repeat(500), body: "b".repeat(900) });
    expect(n.title).toHaveLength(120);
    expect(n.body).toHaveLength(240);
  });

  it("names only pictures of the app's own", () => {
    expect(Push.parse({ ...full, icon: "https://evil.example/x.png" }).icon).toBe("/app-icons/icon-192.png");
    expect(Push.parse({ ...full, badge: "/elsewhere/x.png" }).badge).toBe("/app-icons/badge-96.png");
    expect(Push.parse({ ...full, icon: "/app-icons/shortcut-scan.png" }).icon).toBe("/app-icons/shortcut-scan.png");
  });

  it("shows the notification with the alert's id as its tag, so a repeat is one notification", () => {
    expect(Push.options(Push.parse(full))).toEqual({
      body: "Your teacher sent practice questions.",
      icon: "/app-icons/icon-192.png",
      badge: "/app-icons/badge-96.png",
      lang: "en",
      tag: "n-81",
      data: { id: "n-81", kind: "practice_set_sent", link: "/app/practice/ps-12" },
    });
    expect(Push.options(Push.parse({ title: "x" }))).not.toHaveProperty("tag");
  });
});

describe("the screen a notification opens", () => {
  it.each([
    ["result_ready", { session_id: "se-1" }, "/app/summary/se-1"],
    ["result_ready", {}, "/app/summary"],
    ["practice_set_sent", { practice_set_id: "ps-9", course_id: "c-math" }, "/app/practice/ps-9"],
    ["practice_set_sent", { course_id: "c-math" }, "/app/subject/c-math"],
    ["practice_set_sent", {}, "/app/notifications"],
    ["marked_late", { course_id: "c-math" }, "/app/attendance"],
    ["badge_earned", { badge_code: "answer" }, "/app/achievements"],
    ["generic", { course_id: "c-phys" }, "/app/subject/c-phys"],
    ["generic", {}, "/app/notifications"],
    ["a_kind_from_the_future", {}, "/app/notifications"],
    ["generic", null, "/app/notifications"],
  ])("%s with %j opens %s", (kind, payload, link) => {
    expect(Push.deepLink(kind, payload)).toBe(link);
  });

  it("escapes an id so it stays one segment, and falls back to the Alerts tab for one that cannot be a path", () => {
    expect(Push.deepLink("result_ready", { session_id: "a b" })).toBe("/app/summary/a%20b");
    // Slashes are escaped, so an id cannot climb out of the screen it names.
    expect(Push.parse({ kind: "result_ready", payload: { session_id: "../../x" } }).link).toBe("/app/summary/..%2F..%2Fx");
    expect(Push.parse({ kind: "result_ready", payload: { session_id: ".." } }).link).toBe("/app/notifications");
    expect(Push.parse({ kind: "result_ready", payload: { session_id: "x!" } }).link).toBe("/app/notifications");
  });

  it("opens only a path of this app, by the same rule as the sign-in's `next`", () => {
    const paths = ["/app", "/app/", "/app/summary/se-1", "/app/%2e%2e/x", "/app/..", "//evil.example", "https://evil.example/app", "/apps", "/app/a?b=1", "/other", "", null, 5];
    for (const path of paths) {
      const mine = Push.appPath(path);
      if (typeof path === "string" && path !== "/app/welcome") expect(mine === null, String(path)).toBe(safeNext(path) === null);
      else expect(mine).toBeNull();
    }
  });

  it("is the screen the Alerts tab sends the same alert to", () => {
    const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate("en", key, vars);
    const item = (kind: AlertItem["kind"], payload: AlertItem["payload"]): AlertItem => ({
      id: "n1",
      kind,
      when: 0,
      unread: true,
      courseId: payload.courseId,
      subjectId: payload.subjectId,
      subjectName: payload.subjectName,
      payload,
    });
    const wire = (p: AlertItem["payload"]) => ({ course_id: p.courseId, subject_id: p.subjectId, session_id: p.sessionId, practice_set_id: p.practiceSetId });
    const cases: [AlertItem["kind"], AlertItem["payload"]][] = [
      ["result_ready", { courseId: "math", subjectId: "math", subjectName: "Maths", sessionId: "se-1" }],
      ["result_ready", { courseId: "math", subjectId: "math", subjectName: "Maths" }],
      ["practice_set_sent", { courseId: "math", subjectId: "math", subjectName: "Maths", practiceSetId: "ps-1" }],
      ["practice_set_sent", { courseId: "math", subjectId: "math", subjectName: "Maths" }],
      ["practice_set_sent", {}],
      ["marked_late", { courseId: "physics", subjectId: "physics", subjectName: "Physics", date: 1 }],
      ["badge_earned", { badgeCode: "answer" }],
      ["generic", { courseId: "physics", subjectId: "physics", subjectName: "Physics", title: "x", body: "y" }],
      ["generic", { title: "x", body: "y" }],
    ];
    for (const [kind, payload] of cases) {
      expect(Push.deepLink(kind, wire(payload)), `${kind} ${JSON.stringify(payload)}`).toBe(alertCopy(t, "en", item(kind, payload)).link);
    }
  });

  it("marks the alert on a window opened by a tap", () => {
    expect(Push.withAlert("/app/summary/se-1", "n-81")).toBe("/app/summary/se-1?from_push=n-81");
    expect(Push.withAlert("/app", "")).toBe("/app");
  });
});

describe("which open window takes a tap", () => {
  const win = (url: string, over: { focused?: boolean; visibilityState?: string } = {}) => ({ url, focused: false, visibilityState: "hidden", ...over });

  it("prefers the focused window, then the visible one, then any window of the app", () => {
    const a = win(`${ORIGIN}/app`);
    const b = win(`${ORIGIN}/app/scan`, { visibilityState: "visible" });
    const c = win(`${ORIGIN}/app/settings`, { focused: true, visibilityState: "visible" });
    expect(Push.pickWindow([a, b, c], ORIGIN)).toBe(c);
    expect(Push.pickWindow([a, b], ORIGIN)).toBe(b);
    expect(Push.pickWindow([a], ORIGIN)).toBe(a);
  });

  it("leaves other pages and other origins alone", () => {
    expect(Push.pickWindow([win(`${ORIGIN}/`), win(`${ORIGIN}/appendix`), win("https://other.example/app"), win("not a url")], ORIGIN)).toBeNull();
    expect(Push.pickWindow([], ORIGIN)).toBeNull();
  });
});

describe("the worker's push and tap handlers", () => {
  function load(windows: { url: string; focused?: boolean; visibilityState?: string; postMessage?: ReturnType<typeof vi.fn>; focus?: ReturnType<typeof vi.fn> }[] = []) {
    const handlers: Record<string, (event: unknown) => void> = {};
    const shown: { title: string; options: Record<string, unknown> }[] = [];
    const clients = {
      claim: vi.fn(),
      matchAll: vi.fn(async () => windows),
      openWindow: vi.fn(async () => null),
    };
    const fetchCalled = vi.fn();
    const self = {
      location: { origin: ORIGIN },
      addEventListener: (type: string, fn: (event: unknown) => void) => (handlers[type] = fn),
      skipWaiting: vi.fn(),
      clients,
      registration: { showNotification: vi.fn(async (title: string, options: Record<string, unknown>) => void shown.push({ title, options })) },
    };
    const importScripts = () => runInNewContext(pushSource, { self, URL });
    runInNewContext(sw, { self, importScripts, caches: {}, fetch: fetchCalled, URL, Response, setTimeout, Promise });
    return { handlers, shown, clients, self, fetchCalled };
  }
  const run = async (handler: (e: unknown) => void, event: Record<string, unknown>) => {
    const waits: Promise<unknown>[] = [];
    handler({ ...event, waitUntil: (p: Promise<unknown>) => waits.push(p) });
    await Promise.all(waits);
  };
  const data = (body: unknown) => ({ json: () => (typeof body === "string" ? JSON.parse(body) : body), text: () => String(body) });

  it("shows a notification for a push, and tells the open pages", async () => {
    const page = { url: `${ORIGIN}/app`, postMessage: vi.fn() };
    const { handlers, shown, fetchCalled } = load([page]);
    await run(handlers.push, { data: data({ id: "n-1", kind: "result_ready", title: "Results", body: "Ready", payload: { session_id: "se-1" } }) });
    expect(shown).toHaveLength(1);
    expect(shown[0].title).toBe("Results");
    expect(shown[0].options).toMatchObject({ tag: "n-1", data: { link: "/app/summary/se-1" } });
    expect(page.postMessage).toHaveBeenCalledWith({ type: "push-received", id: "n-1" });
    expect(fetchCalled).not.toHaveBeenCalled();
  });

  it("still shows one when the payload is empty, is not JSON, or the pages cannot be reached", async () => {
    const { handlers, shown, clients } = load();
    await run(handlers.push, { data: null });
    await run(handlers.push, {
      data: {
        json: () => {
          throw new Error("not json");
        },
        text: () => "plain words",
      },
    });
    clients.matchAll.mockRejectedValueOnce(new Error("gone"));
    await run(handlers.push, { data: data({ title: "T", body: "B" }) });
    expect(shown.map((s) => s.title)).toEqual(["TeacherAid", "TeacherAid", "T"]);
    expect(shown[1].options.body).toBe("plain words");
  });

  it("focuses an open window and gives it the screen and the alert, on a tap", async () => {
    const other = { url: `${ORIGIN}/app`, postMessage: vi.fn(), focus: vi.fn() };
    const front = { url: `${ORIGIN}/app/scan`, focused: true, visibilityState: "visible", postMessage: vi.fn(), focus: vi.fn(async () => undefined) };
    const { handlers, clients } = load([other, front]);
    const close = vi.fn();
    await run(handlers.notificationclick, { notification: { close, data: { id: "n-1", link: "/app/practice/ps-12" } } });
    expect(close).toHaveBeenCalled();
    expect(front.postMessage).toHaveBeenCalledWith({ type: "open-alert", id: "n-1", link: "/app/practice/ps-12" });
    expect(front.focus).toHaveBeenCalled();
    expect(other.postMessage).not.toHaveBeenCalled();
    expect(clients.openWindow).not.toHaveBeenCalled();
  });

  it("opens a window on the screen, carrying the alert, when the app is not open", async () => {
    const { handlers, clients } = load([{ url: `${ORIGIN}/`, postMessage: vi.fn() }]);
    await run(handlers.notificationclick, { notification: { close: vi.fn(), data: { id: "n-1", link: "/app/summary/se-1" } } });
    expect(clients.openWindow).toHaveBeenCalledWith("/app/summary/se-1?from_push=n-1");
  });

  it("never opens a screen outside the app, whatever the notification carries", async () => {
    const { handlers, clients } = load();
    await run(handlers.notificationclick, { notification: { close: vi.fn(), data: { id: "n-1", link: "https://evil.example/" } } });
    await run(handlers.notificationclick, { notification: { close: vi.fn(), data: null } });
    expect(clients.openWindow.mock.calls).toEqual([["/app/notifications?from_push=n-1"], ["/app/notifications"]]);
  });

  it("shows the demo's test notification after the delay, through the same reading of the payload", async () => {
    vi.useFakeTimers();
    try {
      const { handlers, shown } = load();
      const done = run(handlers.message, { data: { type: "show-notification", payload: { title: "Test", body: "Body" }, delayMs: 5000 } });
      await vi.advanceTimersByTimeAsync(4999);
      expect(shown).toHaveLength(0);
      await vi.advanceTimersByTimeAsync(2);
      await done;
      expect(shown[0].title).toBe("Test");
    } finally {
      vi.useRealTimers();
    }
  });
});
