import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

/**
 * public/app-sw.js run against a stand-in for the worker's global scope: it must not touch an API
 * request, and its Background Sync handler only wakes the open pages.
 */
const source = readFileSync(new URL("../../public/app-sw.js", import.meta.url), "utf8");
const pushSource = readFileSync(new URL("../../public/app-push.js", import.meta.url), "utf8");

function load() {
  const handlers: Record<string, (event: unknown) => void> = {};
  const posted: unknown[] = [];
  const pages = [{ postMessage: (m: unknown) => posted.push(m) }, { postMessage: (m: unknown) => posted.push(m) }];
  const cacheTouched = vi.fn();
  const self = {
    location: { origin: "https://app.example" },
    addEventListener: (type: string, fn: (event: unknown) => void) => (handlers[type] = fn),
    skipWaiting: vi.fn(),
    clients: { claim: vi.fn(), matchAll: vi.fn(async () => pages) },
  };
  // importScripts runs the push helpers in the same scope, which is where they put TeacherAidPush.
  const importScripts = () => runInNewContext(pushSource, { self, URL });
  runInNewContext(source, { self, importScripts, caches: { open: cacheTouched, match: cacheTouched }, fetch: vi.fn(), URL, Response, setTimeout, Promise });
  return { handlers, posted, cacheTouched, self };
}

const fetchEvent = (url: string, method: string, mode = "cors") => {
  const respondWith = vi.fn();
  const waitUntil = vi.fn();
  return { event: { request: { url, method, mode }, respondWith, waitUntil }, respondWith, waitUntil };
};

describe("the offline worker and answers", () => {
  it("never answers, caches or replays a POST", () => {
    const { handlers, cacheTouched } = load();
    for (const url of ["https://api.example/api/v1/sessions/s1/answers", "https://app.example/api/v1/sessions/s1/answers", "https://app.example/app/play/MATH-7B"]) {
      const { event, respondWith } = fetchEvent(url, "POST", url.includes("/app/play") ? "navigate" : "cors");
      handlers.fetch(event);
      expect(respondWith, url).not.toHaveBeenCalled();
    }
    expect(cacheTouched).not.toHaveBeenCalled();
  });

  it("leaves an API read alone too: another origin, or a same-origin path that is not a page or a static file", () => {
    const { handlers } = load();
    for (const url of ["https://api.example/api/v1/sessions/s1/student-state", "https://app.example/api/v1/sessions/s1/student-state"]) {
      const { event, respondWith } = fetchEvent(url, "GET");
      handlers.fetch(event);
      expect(respondWith, url).not.toHaveBeenCalled();
    }
  });

  it("on the answers sync tag it wakes every open page to flush, and sends nothing itself", async () => {
    const { handlers, posted, self } = load();
    const waits: Promise<unknown>[] = [];
    handlers.sync({ tag: "teacheraid-answers", waitUntil: (p: Promise<unknown>) => waits.push(p) });
    await Promise.all(waits);
    expect(self.clients.matchAll).toHaveBeenCalledWith({ type: "window", includeUncontrolled: true });
    expect(posted).toEqual([{ type: "flush-outbox" }, { type: "flush-outbox" }]);
  });

  it("ignores another sync tag", () => {
    const { handlers, posted } = load();
    const waitUntil = vi.fn();
    handlers.sync({ tag: "something-else", waitUntil });
    expect(waitUntil).not.toHaveBeenCalled();
    expect(posted).toEqual([]);
  });
});
