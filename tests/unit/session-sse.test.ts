import { describe, expect, it, vi } from "vitest";
import { REALTIME_PATH, sseConnect } from "@/lib/app/session/sse";
import type { LinkHandlers, RealtimeMessage } from "@/lib/app/session/transport";

/** An EventSource the test drives: it records what the app asks for and lets the test play the server. */
class FakeEventSource {
  static last: FakeEventSource;
  onopen: ((e: Event) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  listeners = new Map<string, (e: MessageEvent) => void>();
  closed = false;
  constructor(
    readonly url: string,
    readonly init?: { withCredentials?: boolean },
  ) {
    FakeEventSource.last = this;
  }
  addEventListener(type: string, listener: (e: MessageEvent) => void) {
    this.listeners.set(type, listener);
  }
  close() {
    this.closed = true;
  }
  emit(type: string, data: string) {
    this.listeners.get(type)?.({ data } as MessageEvent);
  }
}

function connect() {
  const handlers: LinkHandlers = { open: vi.fn(), message: vi.fn(), closed: vi.fn() };
  const link = sseConnect("https://api.example.test/api/v1", FakeEventSource)(["session.s1.public", "student.me"], handlers);
  return { handlers, link, source: FakeEventSource.last };
}

describe("the live event stream (PROPOSED wire format)", () => {
  it("asks for the channels in the query, with the session cookie", () => {
    const { source } = connect();
    expect(source.url).toBe(`https://api.example.test/api/v1${REALTIME_PATH}?channels=session.s1.public%2Cstudent.me`);
    expect(source.init).toEqual({ withCredentials: true });
  });

  it("says it is open when the connection opens", () => {
    const { source, handlers } = connect();
    source.onopen?.(new Event("open"));
    expect(handlers.open).toHaveBeenCalledOnce();
  });

  it("hands on each event with the channel its body names", () => {
    const { source, handlers } = connect();
    source.emit("question.opened", JSON.stringify({ channel: "session.s1.public", server_now: "2026-10-20T08:00:00Z", question: { id: "q1" } }));
    const message = (handlers.message as ReturnType<typeof vi.fn>).mock.calls[0][0] as RealtimeMessage;
    expect(message).toMatchObject({ channel: "session.s1.public", type: "question.opened" });
    expect((message.data as { question: { id: string } }).question.id).toBe("q1");
  });

  it("hears the ping, which names no channel, so a quiet lesson is not mistaken for a dead link", () => {
    const { source, handlers } = connect();
    source.emit("ping", JSON.stringify({ server_now: "2026-10-20T08:00:00Z" }));
    expect(handlers.message).toHaveBeenCalledWith(expect.objectContaining({ type: "ping", channel: "" }));
  });

  it("passes on a body that is not JSON as null, for the event reader to refuse", () => {
    const { source, handlers } = connect();
    source.emit("question.closed", "not json");
    expect(handlers.message).toHaveBeenCalledWith({ channel: "", type: "question.closed", data: null });
  });

  it("listens for every event the student uses", () => {
    const { source } = connect();
    for (const type of ["state.changed", "question.opened", "question.result", "session.ended", "signed_in_elsewhere", "ping"]) {
      expect(source.listeners.has(type), type).toBe(true);
    }
  });

  it("closes the stream itself on an error, so the app, not the browser, decides when to retry", () => {
    const { source, handlers } = connect();
    source.onerror?.(new Event("error"));
    expect(source.closed).toBe(true);
    expect(handlers.closed).toHaveBeenCalledOnce();
  });

  it("closes the stream when the link is closed", () => {
    const { source, link } = connect();
    link.close();
    expect(source.closed).toBe(true);
  });
});
