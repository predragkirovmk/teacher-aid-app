import { apiBase } from "../api/config";
import { SESSION_EVENT_TYPES } from "../api/wire";
import type { Connect, RealtimeMessage } from "./transport";

/**
 * The live provider skeleton: Server-Sent Events from the API. The managed realtime service is not
 * chosen yet (spec 1.8: Reverb, Pusher or Ably), so this is written against a PROPOSED wire format a
 * plain HTTP server can produce, and is the only file to replace when one is chosen.
 *
 *   GET {apiBase}/realtime?channels=session.{id}.public,student.{id}     (cookies, `Accept: text/event-stream`)
 *
 * The response stays open. Each message is
 *
 *   event: question.opened
 *   data: {"channel":"session.{id}.public","server_now":"2026-10-20T08:12:03.120Z", ...payload of spec 11.2}
 *
 * and the server sends `event: ping` with `data: {"server_now":...}` every 20 seconds, so the app can tell
 * a quiet lesson from a dead connection (transport.ts drops a link that is silent for 45 s). A connection
 * that is open is the student's presence on the session channel (spec 11.2). The app reconnects by itself,
 * with backoff, and asks `GET /sessions/{id}/student-state` every time; the server need not replay anything
 * (no `Last-Event-ID`).
 */
export const REALTIME_PATH = "/realtime";

type EventSourceLike = {
  onopen: ((e: Event) => void) | null;
  onerror: ((e: Event) => void) | null;
  addEventListener(type: string, listener: (e: MessageEvent) => void): void;
  close(): void;
};
type EventSourceFactory = new (url: string, init?: { withCredentials?: boolean }) => EventSourceLike;

/** The channel a message is for, from its body; a ping names none. */
function parse(type: string, raw: unknown): RealtimeMessage {
  let data: unknown = null;
  try {
    data = typeof raw === "string" ? JSON.parse(raw) : null;
  } catch {
    // A body that is not JSON is passed on as null; the event reader will refuse it and the app asks for a snapshot.
  }
  const channel = data && typeof data === "object" && typeof (data as { channel?: unknown }).channel === "string" ? (data as { channel: string }).channel : "";
  return { channel, type, data };
}

export function sseConnect(base: string = apiBase, EventSourceImpl: EventSourceFactory = globalThis.EventSource as unknown as EventSourceFactory): Connect {
  return (channels, handlers) => {
    const source = new EventSourceImpl(`${base}${REALTIME_PATH}?channels=${encodeURIComponent(channels.join(","))}`, { withCredentials: true });
    source.onopen = () => handlers.open();
    // The browser would retry by itself; the app does it, so every return is followed by a snapshot.
    source.onerror = () => {
      source.close();
      handlers.closed();
    };
    for (const type of [...SESSION_EVENT_TYPES, "ping"]) {
      source.addEventListener(type, (e) => handlers.message(parse(type, e.data)));
    }
    return { close: () => source.close() };
  };
}
