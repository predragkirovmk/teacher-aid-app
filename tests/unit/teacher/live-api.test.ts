import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { ApiError } from "@/lib/teacher/api/errors";
import { createLiveApi, KEEPALIVE_MAX_BYTES } from "@/lib/teacher/api/live";

/**
 * The live adapter is the only code that will talk to the real API (and so to the AI's lesson jobs); until the backend exists
 * nothing else runs it. These tests pin what it sends (method, path, body, cookies) and how it reads what comes back.
 */

type Call = { url: string; init: RequestInit };
let calls: Call[];
let answer: () => Promise<Response>;

const json = (body: unknown, status = 200) => () => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));

beforeEach(() => {
  calls = [];
  answer = json({});
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init: RequestInit) => {
      calls.push({ url, init });
      return answer();
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const last = () => calls[calls.length - 1];
const bodyOf = (c: Call) => JSON.parse(c.init.body as string);

describe("the lesson job endpoints (F-03, F-04, BR-LES-08)", () => {
  test("typed material is JSON to /lessons/sources", async () => {
    answer = json({ source_id: "src-1" }, 201);
    const api = createLiveApi();
    await expect(api.createSource({ kind: "typed", text: "Фотосинтеза е процес во кој растенијата ..." })).resolves.toEqual({ source_id: "src-1" });
    expect(last().url).toBe("/api/v1/lessons/sources");
    expect(last().init.method).toBe("POST");
    expect((last().init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    expect(bodyOf(last())).toEqual({ text: "Фотосинтеза е процес во кој растенијата ..." });
  });

  test("a document goes as multipart, the browser setting the boundary", async () => {
    answer = json({ source_id: "src-2" }, 201);
    const file = new File(["%PDF-1.7"], "plan.pdf", { type: "application/pdf" });
    await createLiveApi().createSource({ kind: "upload", file });
    const sent = last().init;
    expect(sent.body).toBeInstanceOf(FormData);
    expect((sent.body as FormData).get("file")).toBeInstanceOf(File);
    expect((sent.headers as Record<string, string>)["Content-Type"]).toBeUndefined();
  });

  test("generate, refine and retry each answer the pending draft", async () => {
    const pending = { id: "d-1", status: "pending" };
    answer = json(pending, 202);
    const api = createLiveApi();
    await expect(api.generateLesson({ source_id: "src-1", subject_id: "sub-1", year: 2, emphasis: "втор дел" })).resolves.toEqual(pending);
    expect(last().url).toBe("/api/v1/lessons/generate");
    expect(bodyOf(last())).toEqual({ source_id: "src-1", subject_id: "sub-1", year: 2, emphasis: "втор дел" });

    await api.refineDraft("d-1", "harder");
    expect(last().url).toBe("/api/v1/lessons/drafts/d-1/refine");
    expect(last().init.method).toBe("POST");
    expect(bodyOf(last())).toEqual({ refinement: "harder" });

    await api.retryDraft("d-1");
    expect(last().url).toBe("/api/v1/lessons/drafts/d-1/retry");
    expect(last().init.method).toBe("POST");
  });

  test("polling, listing and cancelling a draft", async () => {
    const api = createLiveApi();
    answer = json({ id: "d-1", status: "ready" });
    await api.getDraft("d-1");
    expect(last().url).toBe("/api/v1/lessons/drafts/d-1");
    expect(last().init.method).toBe("GET");

    answer = json([]);
    await api.listDrafts();
    expect(last().url).toBe("/api/v1/lessons/drafts");

    answer = () => Promise.resolve(new Response(null, { status: 204 }));
    await expect(api.deleteDraft("d-1")).resolves.toBeUndefined();
    expect(last().init.method).toBe("DELETE");
  });

  test("an id is encoded into the path", async () => {
    await createLiveApi().getDraft("a/b?c");
    expect(last().url).toBe("/api/v1/lessons/drafts/a%2Fb%3Fc");
  });

  test("every call carries the session cookie and asks for JSON", async () => {
    const api = createLiveApi();
    await api.getMe();
    await api.listLessons();
    for (const c of calls) {
      expect(c.init.credentials).toBe("include");
      expect((c.init.headers as Record<string, string>).Accept).toBe("application/json");
    }
  });
});

describe("autosave's keepalive (64 KiB browser quota)", () => {
  const draft = (chars: number) => ({ title: "Т", review_summary: "ж".repeat(chars), questions: [] });

  test("a draft of ordinary size may outlive the page", async () => {
    await createLiveApi().updateDraft("d-1", draft(2_000));
    expect(last().url).toBe("/api/v1/lessons/drafts/d-1");
    expect(last().init.method).toBe("PATCH");
    expect(last().init.keepalive).toBe(true);
  });

  test("a draft over the quota goes as an ordinary request instead of failing as offline", async () => {
    // Cyrillic is two bytes a letter in UTF-8, so this is over the limit in bytes though under it in characters.
    const chars = Math.ceil(KEEPALIVE_MAX_BYTES / 2) + 10;
    await createLiveApi().updateDraft("d-1", draft(chars));
    expect(new TextEncoder().encode(last().init.body as string).length).toBeGreaterThan(KEEPALIVE_MAX_BYTES);
    expect(last().init.keepalive).toBe(false);
  });

  test("no other call asks for keepalive", async () => {
    await createLiveApi().saveLesson({ draft_id: "d-1", title: "Т", review_summary: "", questions: [] });
    expect(last().init.keepalive).toBe(false);
  });
});

describe("what comes back", () => {
  test("a refusal is read from the envelope, with its reason", async () => {
    answer = json({ error: { code: "validation_failed", reason: "no_text", message: "scan" } }, 422);
    const error = await createLiveApi()
      .createSource({ kind: "typed", text: "x".repeat(50) })
      .catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe("validation_failed");
    expect(error.reason).toBe("no_text");
    expect(error.status).toBe(422);
  });

  test("a fetch that throws is `network`", async () => {
    answer = () => Promise.reject(new TypeError("Failed to fetch"));
    await expect(createLiveApi().getMe()).rejects.toMatchObject({ code: "network" });
  });

  test("a body that is not JSON is `invalid_response`", async () => {
    answer = () => Promise.resolve(new Response("<html>gateway</html>", { status: 200 }));
    await expect(createLiveApi().getMe()).rejects.toMatchObject({ code: "invalid_response", status: 200 });
  });

  test("a screen that stops waiting abandons the request, as `network`", async () => {
    vi.mocked(fetch).mockImplementation((url, init) => {
      calls.push({ url: url as string, init: init as RequestInit });
      return new Promise<Response>((_, reject) => (init as RequestInit).signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));
    });
    const stop = new AbortController();
    const waiting = createLiveApi().createSource({ kind: "typed", text: "x".repeat(50) }, { signal: stop.signal });
    stop.abort();
    await expect(waiting).rejects.toMatchObject({ code: "network" });
  });

  test("a call that hangs gives up at 15 seconds", async () => {
    vi.useFakeTimers();
    vi.mocked(fetch).mockImplementation((_, init) =>
      new Promise<Response>((_, reject) => (init as RequestInit).signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))),
    );
    const waiting = createLiveApi().getDraft("d-1");
    const settled = expect(waiting).rejects.toMatchObject({ code: "network" });
    await vi.advanceTimersByTimeAsync(15_000);
    await settled;
  });
});

describe("realtime (11.4)", () => {
  test("a console channel listens for the console's events, with the cookie", () => {
    const opened: { url: string; withCredentials: boolean; types: string[] }[] = [];
    class FakeSource {
      onopen: (() => void) | null = null;
      onerror: (() => void) | null = null;
      types: string[] = [];
      constructor(url: string, init: { withCredentials: boolean }) {
        opened.push({ url, withCredentials: init.withCredentials, types: this.types });
      }
      addEventListener(type: string) {
        this.types.push(type);
      }
      close() {}
    }
    vi.stubGlobal("EventSource", FakeSource);
    const stop = createLiveApi().openChannel("session.s-1.console", { onEvent: () => {} });
    expect(opened).toHaveLength(1);
    expect(opened[0].url).toBe("/api/v1/realtime?channels=session.s-1.console");
    expect(opened[0].withCredentials).toBe(true);
    expect(opened[0].types).toEqual(expect.arrayContaining(["ping", "student.joined", "question.opened", "anon_question.received"]));
    stop();
  });
});
