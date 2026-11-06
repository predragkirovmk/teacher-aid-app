import { toApiError, type ApiErrorCode } from "../api/errors";
import type { FocusEventInput, Id } from "../api/types";
import { MAX_AGE_MS } from "./outbox";
import { backoffDelay } from "./transport";

/**
 * The focus events on their way to the server (spec 7.10, FR-FOC-02, EC-FOC-04): `lost` and `back`, each with its own
 * time, so they are as good late as early. A small queue, apart from the answer outbox because the endpoint takes a
 * batch: events written within a moment of each other go in one request, and so does everything that piled up while
 * the phone had no signal.
 *
 * It is sent again until the server has spoken. The server takes the same event twice as one (type, time and question
 * are its key), so a resend after a lost reply is harmless. An event is dropped, unsent, when the lesson is over, when
 * the server will never take it, or when it is older than the outbox keeps an answer (BR-NET-05).
 */

/** Events written within this long of each other go in one request. */
export const BATCH_MS = 250;
/** The most events in one request. */
export const BATCH_MAX = 50;
/** The most the phone keeps; the oldest go first. */
const KEEP_MAX = 200;

const AUTH_CODES: ApiErrorCode[] = ["unauthenticated", "signed_in_elsewhere"];
const GIVE_UP_CODES: ApiErrorCode[] = ["validation_failed", "not_found", "session_ended"];

export type FocusRecord = FocusEventInput & { studentId: Id; sessionId: Id; savedAt: number };

export interface FocusStore {
  all(): FocusRecord[];
  save(records: FocusRecord[]): void;
}

export function memoryFocusStore(): FocusStore {
  let kept: FocusRecord[] = [];
  return { all: () => kept, save: (r) => void (kept = r) };
}

export const FOCUS_QUEUE_KEY = "teacheraid-focus-queue";

/** localStorage, with memory behind it where the browser refuses. A handful of small records, so no database. */
export function localFocusStore(): FocusStore {
  const memory = memoryFocusStore();
  return {
    all() {
      try {
        const parsed = JSON.parse(window.localStorage.getItem(FOCUS_QUEUE_KEY) ?? "null") as unknown;
        if (Array.isArray(parsed)) return parsed as FocusRecord[];
      } catch {
        // unreadable or blocked
      }
      return memory.all();
    },
    save(records) {
      memory.save(records);
      try {
        window.localStorage.setItem(FOCUS_QUEUE_KEY, JSON.stringify(records));
      } catch {
        // blocked or full: it is still in memory
      }
    },
  };
}

export type FocusQueueDeps = {
  store: FocusStore;
  /** The raw call, `POST /sessions/{id}/focus-events`; see send.ts. */
  send(sessionId: Id, events: FocusEventInput[]): Promise<void>;
  now?: () => number;
  random?: () => number;
};

export type FocusQueue = {
  /** The student is signed in: their saved events are sent. */
  start(studentId: Id): void;
  stop(): void;
  /** Keep the event, and send it with whatever else is waiting in a moment. */
  add(event: FocusEventInput & { studentId: Id; sessionId: Id }): void;
  flush(): Promise<void>;
  /** What is waiting for this student. */
  size(studentId: Id): number;
  /** Drop everything waiting, for anyone: the student cleared this phone. */
  clear(): void;
};

export function createFocusQueue(deps: FocusQueueDeps): FocusQueue {
  const { store, send } = deps;
  const now = deps.now ?? Date.now;
  const random = deps.random ?? Math.random;

  let records: FocusRecord[] | null = null;
  let studentId: Id | null = null;
  let flushing: Promise<void> | null = null;
  let again = false;
  let failures = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let retrying = false;

  const load = () => (records ??= store.all());
  const keep = (next: FocusRecord[]) => {
    records = next;
    store.save(next);
  };
  const schedule = (ms: number) => {
    clearTimeout(timer);
    timer = setTimeout(() => void flush(), ms);
  };

  async function pass() {
    const fresh = load().filter((r) => now() - r.savedAt <= MAX_AGE_MS);
    if (fresh.length !== load().length) keep(fresh);
    for (const sessionId of [...new Set(fresh.filter((r) => r.studentId === studentId).map((r) => r.sessionId))]) {
      for (;;) {
        const batch = load()
          .filter((r) => r.studentId === studentId && r.sessionId === sessionId)
          .sort((a, b) => a.at - b.at)
          .slice(0, BATCH_MAX);
        if (batch.length === 0) break;
        try {
          await send(sessionId, batch.map(({ type, at, sessionQuestionId }) => ({ type, at, sessionQuestionId })));
        } catch (e) {
          const code = toApiError(e).code;
          if (GIVE_UP_CODES.includes(code)) {
            // The lesson is over or the server will never take these: sending them again would only fail again.
          } else if (AUTH_CODES.includes(code)) {
            return;
          } else {
            retrying = true;
            schedule(backoffDelay(failures++, random));
            return;
          }
        }
        failures = 0;
        retrying = false;
        const sent = new Set(batch);
        keep(load().filter((r) => !sent.has(r)));
      }
    }
  }

  function flush(): Promise<void> {
    if (studentId === null) return Promise.resolve();
    if (flushing) {
      again = true;
      return flushing;
    }
    clearTimeout(timer);
    flushing = (async () => {
      try {
        do {
          again = false;
          await pass();
        } while (again);
      } finally {
        flushing = null;
      }
    })();
    return flushing;
  }

  return {
    start(id) {
      studentId = id;
      void flush();
    },
    stop() {
      studentId = null;
      clearTimeout(timer);
      retrying = false;
    },
    add(event) {
      studentId ??= event.studentId;
      keep([...load(), { ...event, savedAt: now() }].slice(-KEEP_MAX));
      // While a retry is waiting out its backoff the new event waits with the rest.
      if (!retrying) schedule(BATCH_MS);
    },
    flush,
    size: (id) => load().filter((r) => r.studentId === id).length,
    clear() {
      clearTimeout(timer);
      retrying = false;
      failures = 0;
      keep([]);
    },
  };
}
