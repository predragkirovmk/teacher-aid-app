import type { ChannelStatus } from "./client";

/**
 * The one place that knows the realtime transport (spec 11.4): Server-Sent Events with the session cookie. A managed provider
 * replaces this file and nothing else. It opens the stream, tells the screen when it is open, and when it is lost (an error, or
 * silence for longer than the stream's own ping allows) it opens it again on its own, waiting 1 second and then twice as long each
 * time up to 15, so a computer that has lost the connection does not hammer the server. Every time the stream opens it says so, since
 * what happened while it was down is not replayed: the screen reads its snapshot again.
 */

/** The wait before the first try again, and the longest wait (11.4). */
export const SSE_BACKOFF_START_MS = 1000;
export const SSE_BACKOFF_MAX_MS = 15_000;
/** The stream sends `ping` every 20 seconds; one that has been quiet for 45 is dead, whatever the browser thinks (11.4). */
export const SSE_SILENCE_MS = 45_000;

/** The wait after a failure that was itself preceded by a wait of `previous` (null for the first). */
export const nextBackoff = (previous: number | null): number => (previous === null ? SSE_BACKOFF_START_MS : Math.min(previous * 2, SSE_BACKOFF_MAX_MS));

/** The part of `EventSource` that is used, so that a test can play a stream without a browser. */
export type StreamLike = {
  addEventListener(type: string, listener: (event: { data?: unknown }) => void): void;
  close(): void;
  onopen: (() => void) | null;
  onerror: (() => void) | null;
};

export type Timers = {
  set: (fn: () => void, ms: number) => unknown;
  clear: (handle: unknown) => void;
};

export type SseOptions = {
  url: string;
  /** The event names to listen for (the stream names its events, so each one is listened to by name). */
  types: readonly string[];
  onEvent: (type: string, body: unknown) => void;
  onStatus: (status: ChannelStatus) => void;
  open?: (url: string) => StreamLike;
  timers?: Timers;
};

const browserTimers: Timers = { set: (fn, ms) => setTimeout(fn, ms), clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>) };
const browserStream = (url: string): StreamLike => new EventSource(url, { withCredentials: true }) as unknown as StreamLike;

/** Open the stream and keep it open until the returned function is called. */
export function connectSse({ url, types, onEvent, onStatus, open = browserStream, timers = browserTimers }: SseOptions): () => void {
  let stream: StreamLike | null = null;
  let retry: unknown = null;
  let silence: unknown = null;
  let backoff: number | null = null;
  let stopped = false;
  let everOpened = false;

  const quiet = () => {
    if (silence !== null) timers.clear(silence);
    silence = null;
  };

  const lost = () => {
    if (stopped) return;
    quiet();
    stream?.close();
    stream = null;
    onStatus("reconnecting");
    backoff = nextBackoff(backoff);
    retry = timers.set(connect, backoff);
  };

  const heard = () => {
    quiet();
    silence = timers.set(lost, SSE_SILENCE_MS);
  };

  function connect() {
    if (stopped) return;
    retry = null;
    let source: StreamLike;
    try {
      source = open(url);
    } catch {
      lost();
      return;
    }
    stream = source;
    if (!everOpened) onStatus("connecting");
    source.onopen = () => {
      everOpened = true;
      backoff = null;
      heard();
      onStatus("open");
    };
    source.onerror = lost;
    for (const type of types) {
      source.addEventListener(type, (event) => {
        heard();
        if (type === "ping") return;
        try {
          onEvent(type, typeof event.data === "string" ? JSON.parse(event.data) : event.data);
        } catch {
          // A message that is not JSON is ignored: an event the app does not understand is never fatal (11.2).
        }
      });
    }
  }

  connect();

  return () => {
    stopped = true;
    quiet();
    if (retry !== null) timers.clear(retry);
    stream?.close();
    stream = null;
  };
}
