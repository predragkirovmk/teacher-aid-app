"use client";

import { useMemo, useSyncExternalStore } from "react";
import { api, serverApi, type SettledPromise, type TeacherApi } from "./client";
import { toApiError, type ApiError } from "./errors";

/**
 * A small cache between the hooks and the adapter: one slot per query key, shared by every screen that
 * asks, read through useSyncExternalStore.
 *
 * - An adapter that answers at once (the mock returns settled promises) fills the slot in the very
 *   render that asks, so a screen never shows a loading frame it did not need.
 * - The server render, and the render that hydrates it, read `serverApi` (a fresh demo school in mock
 *   mode, nothing in live mode), then the browser's own data takes over. Server and first client
 *   render therefore always match.
 * - When the adapter says something changed (`api.subscribe`) every slot that has been read loads
 *   again; an answer that was on screen stays there until the new one lands.
 */

type Entry<T> = { readonly data: T | undefined; readonly error: ApiError | null };

const LOADING: Entry<never> = { data: undefined, error: null };

/** Whether two answers are the same data. They are plain JSON, so comparing the text is exact and cheap. */
const sameData = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b);

/** How long a loaded answer from a slow adapter counts as fresh when a screen mounts again. */
const FRESH_MS = 30_000;

type Settled<T> = { ok: true; value: T } | { ok: false; error: unknown };

export class Slot<T> {
  entry: Entry<T> = LOADING;
  private serverEntry: Entry<T> | null = null;
  private listeners = new Set<() => void>();
  private started = false;
  private fetchedAt = 0;
  private sync = false;
  private seq = 0;
  /** Something changed while nobody was looking; the next reader asks again. */
  private stale = false;

  constructor(
    readonly key: string,
    public load: (a: TeacherApi) => Promise<T>,
  ) {}

  /**
   * Ask the adapter. `notify` is false while a render is reading, which must not tell anyone. Resolves with the failure
   * once the answer (or the failure) has been applied, so a caller that needs to know can wait; a render never does.
   */
  fetch(notify: boolean): Promise<ApiError | null> {
    const seq = ++this.seq;
    // Cleared when the ask is made, not when it lands: a read in between must not ask again, and a change that comes while
    // this one is in flight (which sets it again) still has its own fresh look to wait for.
    this.stale = false;
    const apply = (s: Settled<T>, announce: boolean) => {
      if (seq !== this.seq) return; // A newer ask has taken over.
      this.fetchedAt = Date.now();
      const failure = s.ok ? null : toApiError(s.error);
      // An answer that was on screen stays; the failure rides along.
      const next: Entry<T> = s.ok ? { data: s.value, error: null } : { data: this.entry.data, error: failure };
      // The same answer again is not news: keep the object readers already hold, so nothing re-renders.
      if (s.ok && this.entry.error === null && sameData(this.entry.data, s.value)) return;
      this.entry = next;
      if (announce) this.emit();
    };
    let p: Promise<T>;
    try {
      p = this.load(api);
    } catch (e) {
      apply({ ok: false, error: e }, notify);
      return Promise.resolve(this.entry.error);
    }
    const settled = (p as Partial<SettledPromise<T>>).settled;
    if (settled) {
      this.sync = true;
      apply(settled, notify);
      return Promise.resolve(this.entry.error);
    }
    return p
      .then(
        (value) => apply({ ok: true, value }, true),
        (error) => apply({ ok: false, error }, true),
      )
      .then(() => this.entry.error);
  }

  private emit() {
    this.listeners.forEach((l) => l());
  }

  /** Take an answer the caller already has, in place of asking again. */
  put(data: T) {
    this.seq++;
    this.fetchedAt = Date.now();
    this.entry = { data, error: null };
    this.emit();
  }

  /** Forget the answer, for when a different teacher may be signed in next. */
  reset() {
    this.seq++;
    this.started = false;
    this.sync = false;
    this.fetchedAt = 0;
    this.serverEntry = null;
    this.stale = false;
    this.entry = LOADING;
    this.emit();
  }

  /** A fresh look at the adapter, for when something it knows has changed. */
  refresh = () => {
    if (!this.started) return;
    // Only a slot someone is reading asks now; the others ask when they are next read.
    if (this.listeners.size > 0) void this.fetch(true);
    else this.stale = true;
  };

  read = (): Entry<T> => {
    if (!this.started) {
      this.started = true;
      void this.fetch(false);
    } else if (this.stale && this.listeners.size === 0) {
      void this.fetch(false);
    }
    return this.entry;
  };

  readServer = (): Entry<T> => {
    if (!serverApi) return LOADING;
    if (!this.serverEntry) {
      const settled = (this.load(serverApi) as Partial<SettledPromise<T>>).settled;
      this.serverEntry = settled?.ok ? { data: settled.value, error: null } : LOADING;
    }
    return this.serverEntry;
  };

  subscribe = (listener: () => void) => {
    watchApi();
    const first = this.listeners.size === 0;
    this.listeners.add(listener);
    // Coming back to a slot that has gone quiet: a slow adapter's answer may be old by now. A slot that has not been
    // answered yet (fetchedAt 0) has its first request in flight; do not ask twice.
    if (first && this.started && !this.sync && this.fetchedAt > 0 && Date.now() - this.fetchedAt > FRESH_MS) void this.fetch(true);
    return () => {
      this.listeners.delete(listener);
    };
  };
}

const slots = new Map<string, Slot<unknown>>();
let watching = false;

/** Listen to the adapter once, for as long as the page lives. */
function watchApi() {
  if (watching) return;
  watching = true;
  api.subscribe(() => slots.forEach((s) => s.refresh()));
}

/** The one slot for a key. Exported for the tests of the cache; screens go through `useQuery`. */
export function slotFor<T>(key: string, load: (a: TeacherApi) => Promise<T>): Slot<T> {
  let slot = slots.get(key) as Slot<T> | undefined;
  if (!slot) {
    slot = new Slot(key, load);
    slots.set(key, slot as Slot<unknown>);
  }
  slot.load = load;
  return slot;
}

/** Load the slots whose key is one of these, or starts with one followed by a colon, again; with none, all of them. */
export function invalidate(...prefixes: string[]) {
  slots.forEach((slot) => {
    if (!prefixes.length || prefixes.some((p) => slot.key === p || slot.key.startsWith(`${p}:`))) slot.refresh();
  });
}

/** Drop every answer, so nothing one teacher saw is shown to the next. */
export function resetQueries() {
  slots.forEach((slot) => slot.reset());
}

/** Forget what a slot holds, for a thing that has been deleted: the next reader asks again instead of showing what is gone. */
export function forget(key: string) {
  slots.get(key)?.reset();
}

/** Put an answer straight into a slot that has been read, for a call that returns the fresh data. */
export function seed<T>(key: string, data: T) {
  (slots.get(key) as Slot<T> | undefined)?.put(data);
}

export type Query<T> = {
  /** `loading` until there is an answer, `ready` when there is data (even if a refresh failed), else `error`. */
  status: "loading" | "ready" | "error";
  data: T | undefined;
  /** The last failure; with `ready` it means the latest refresh failed and `data` is the one before. */
  error: ApiError | null;
  refetch: () => Promise<unknown>;
};

/** The same query with its data turned into something else; loading and error pass through. */
export function mapQuery<T, U>(q: Query<T>, fn: (data: T) => U): Query<U> {
  return { ...q, data: q.data === undefined ? undefined : fn(q.data) };
}

const subscribeNothing = () => () => {};
const readOff = (): Entry<never> => LOADING;

/**
 * Read one query. `enabled: false` leaves it alone (no request, always loading) for data not needed yet. The key names the
 * data and its arguments, for example `lessons:l-nizi`; it starts with the name that `invalidate` and `change` use.
 */
export function useQuery<T>(key: string, load: (a: TeacherApi) => Promise<T>, enabled = true): Query<T> {
  const slot = slotFor(key, load);
  const entry = useSyncExternalStore(
    enabled ? slot.subscribe : subscribeNothing,
    enabled ? slot.read : readOff,
    enabled ? slot.readServer : readOff,
  ) as Entry<T>;
  return useMemo(
    () => ({
      status: entry.data !== undefined ? "ready" : entry.error ? "error" : "loading",
      data: entry.data,
      error: entry.error,
      refetch: () => slot.fetch(true),
    }),
    [entry, slot],
  );
}

/**
 * Make a change through the adapter, then load again what it touched. The live API answers with the new data of the thing
 * changed, which callers may `seed`.
 */
export async function change<T>(call: (a: TeacherApi) => Promise<T>, touches: string[] = []): Promise<T> {
  const result = await call(api);
  if (touches.length) invalidate(...touches);
  return result;
}
