/**
 * "Work saves itself" (the plan): every change the teacher makes to a draft is sent a moment after they stop, and the page says,
 * calmly, where that stands. Nothing here touches the browser, so all of it is unit tested: the engine takes its timers and its
 * save as arguments.
 */

/** How long after the last change the draft is sent. Long enough that typing is one save, short enough that a pause is saved. */
export const SAVE_DELAY_MS = 800;
/** After a failed save the engine tries again by itself this often, until it works or the teacher leaves. */
export const SAVE_RETRY_MS = 5_000;

/**
 * `idle` nothing has been changed here yet; `dirty` a change is waiting its moment; `saving` it is on its way;
 * `saved` the draft has every change; `failed` the last try did not get through and the engine will try again.
 */
export type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "failed";

/** The words of the visible status are one of these (idle and saved are told apart: only one says anything has happened). */
export const isSettled = (status: SaveStatus): boolean => status === "idle" || status === "saved";

/** What a screen reader was last told about saving. Nothing yet, or one of the two things worth interrupting for. */
export type Spoken = "saved" | "failed" | null;

/**
 * What to say aloud as the status changes, and what has been said. Once: "saved" is said the first time the draft has everything
 * and then not again for every key, and "failed" is said when it stops being so; the first "saved" after a failure is said again,
 * since it is news. Moving between `dirty` and `saving` says nothing.
 */
export function announce(spoken: Spoken, status: SaveStatus): { say: "saved" | "failed" | null; spoken: Spoken } {
  if (status === "saved" && spoken !== "saved") return { say: "saved", spoken: "saved" };
  if (status === "failed" && spoken !== "failed") return { say: "failed", spoken: "failed" };
  return { say: null, spoken };
}

/**
 * Whether leaving the page would lose something. A change that is only waiting for its moment is sent as the page goes (the engine
 * flushes), so it is not asked about; one that could not be sent, and a number typed that is not a number yet and so was never
 * in the draft, would be lost, and the page asks first.
 */
export const losesWorkOnLeaving = (status: SaveStatus, unfinishedNumber: boolean): boolean => status === "failed" || unfinishedNumber;

export type Timers = { set(fn: () => void, ms: number): unknown; clear(handle: unknown): void };

const realTimers: Timers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export type Autosaver<T> = {
  /** The draft as it now is. Sent after the quiet moment; a newer one sent meanwhile replaces it. */
  edit(value: T): void;
  /** Send now what is waiting, and answer when the draft has it (true) or when it could not be sent (false). */
  flush(): Promise<boolean>;
  status(): SaveStatus;
  /** No more timers; what is waiting is not sent (call `flush` first for that). */
  dispose(): void;
};

/**
 * One save at a time, in the order the changes were made, and always the newest value: a change that comes while one is on its way
 * is sent when that one is done, and the ones in between are never sent. A failure is kept and tried again by itself.
 */
export function createAutosaver<T>(options: {
  save: (value: T) => Promise<unknown>;
  onStatus: (status: SaveStatus) => void;
  delay?: number;
  retryAfter?: number;
  timers?: Timers;
}): Autosaver<T> {
  const { save, onStatus, delay = SAVE_DELAY_MS, retryAfter = SAVE_RETRY_MS, timers = realTimers } = options;
  let latest: T | undefined;
  let waiting = false;
  let current: Promise<void> | null = null;
  let status: SaveStatus = "idle";
  let timer: unknown = null;
  let disposed = false;

  const set = (next: SaveStatus) => {
    if (next === status) return;
    status = next;
    onStatus(next);
  };
  const stopTimer = () => {
    if (timer !== null) timers.clear(timer);
    timer = null;
  };
  const start = (ms: number) => {
    stopTimer();
    timer = timers.set(() => {
      timer = null;
      void send();
    }, ms);
  };

  /** Send the newest value if one is waiting and none is on its way. `save` is called at once, so a page that is closing still sends. */
  function send(): Promise<void> {
    if (current) return current;
    if (!waiting) return Promise.resolve();
    const value = latest as T;
    waiting = false;
    set("saving");
    let attempt: Promise<unknown>;
    try {
      attempt = Promise.resolve(save(value));
    } catch (e) {
      attempt = Promise.reject(e);
    }
    // The handlers below always run after this line has set `current`, whatever `save` did.
    current = attempt.then(
      () => {
        current = null;
        // Something changed while it was on its way: that is the next one, and the draft does not have it yet.
        if (waiting) {
          set("dirty");
          return timer === null ? send() : undefined;
        }
        set("saved");
        return undefined;
      },
      () => {
        current = null;
        // Not sent: it is waiting again, unless a newer value has come since, which is the one that waits.
        waiting = true;
        set("failed");
        // A newer change has its own, shorter, timer running: that one sends the newest value, so it is not replaced.
        if (!disposed && timer === null) start(retryAfter);
      },
    );
    return current;
  }

  return {
    edit(value) {
      if (disposed) return;
      latest = value;
      waiting = true;
      // While one is on its way the status stays "saving" until it lands, then says there is more.
      if (!current) set("dirty");
      start(delay);
    },
    async flush() {
      stopTimer();
      // Newer changes can arrive while one is sent; keep going until the draft has everything or a try fails.
      while (waiting || current) {
        await send();
        if (status === "failed") return false;
      }
      return true;
    },
    status: () => status,
    dispose() {
      disposed = true;
      stopTimer();
    },
  };
}
