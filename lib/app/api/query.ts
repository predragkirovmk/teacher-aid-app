"use client";

import { useMemo, useSyncExternalStore } from "react";
import { client, serverClient } from "./index";
import type { ApiClient, SettledPromise } from "./client";
import { toApiError, type ApiError } from "./errors";

/**
 * A small cache between the hooks and the client: one slot per query key, shared by every screen
 * that asks, read through useSyncExternalStore like the demo store was.
 *
 * - An adapter that answers at once (the mock returns settled promises) fills the slot in the very
 *   render that asks, so a screen never shows a loading frame it did not show before.
 * - The server render, and the render that hydrates it, read `serverClient` (the demo's defaults in
 *   mock mode, nothing in live mode), then the browser's own data takes over, exactly as the demo
 *   store's server snapshot always did.
 * - When the client says something changed (`client.subscribe`: the mock's local data, a realtime
 *   event later) every slot that has been read loads again; an answer that was already on screen
 *   stays there until the new one lands.
 */

type Entry<T> = { readonly data: T | undefined; readonly error: ApiError | null };

const LOADING: Entry<never> = { data: undefined, error: null };

/** How long a loaded answer from a slow client counts as fresh when a screen mounts again. */
const FRESH_MS = 30_000;

type Settled<T> = { ok: true; value: T } | { ok: false; error: unknown };

class Slot<T> {
  entry: Entry<T> = LOADING;
  private serverEntry: Entry<T> | null = null;
  private listeners = new Set<() => void>();
  private started = false;
  private fetchedAt = 0;
  private sync = false;
  private seq = 0;

  constructor(
    readonly key: string,
    public load: (c: ApiClient) => Promise<T>,
  ) {}

  /** Ask the client. `notify` is false while a render is reading, which must not tell anyone. */
  fetch(notify: boolean) {
    const seq = ++this.seq;
    const apply = (s: Settled<T>, announce: boolean) => {
      if (seq !== this.seq) return; // a newer ask has taken over
      this.fetchedAt = Date.now();
      this.entry = s.ok
        ? { data: s.value, error: null }
        : // an answer that was on screen stays; the failure rides along
          { data: this.entry.data, error: toApiError(s.error) };
      if (announce) this.emit();
    };
    let p: Promise<T>;
    try {
      p = this.load(client);
    } catch (e) {
      apply({ ok: false, error: e }, notify);
      return;
    }
    const settled = (p as Partial<SettledPromise<T>>).settled;
    if (settled) {
      this.sync = true;
      apply(settled, notify);
      return;
    }
    p.then(
      (value) => apply({ ok: true, value }, true),
      (error) => apply({ ok: false, error }, true),
    );
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

  /** Forget the answer, for when a different person may be signed in next. */
  reset() {
    this.seq++;
    this.started = false;
    this.sync = false;
    this.serverEntry = null;
    this.entry = LOADING;
    this.emit();
  }

  /** A fresh look at the client, for when something it knows has changed. */
  refresh = () => {
    if (this.started) this.fetch(true);
  };

  read = (): Entry<T> => {
    if (!this.started) {
      this.started = true;
      this.fetch(false);
    }
    return this.entry;
  };

  readServer = (): Entry<T> => {
    if (!serverClient) return LOADING;
    if (!this.serverEntry) {
      const settled = (this.load(serverClient) as Partial<SettledPromise<T>>).settled;
      this.serverEntry = settled?.ok ? { data: settled.value, error: null } : LOADING;
    }
    return this.serverEntry;
  };

  subscribe = (listener: () => void) => {
    watchClient();
    const first = this.listeners.size === 0;
    this.listeners.add(listener);
    // Coming back to a slot that has gone quiet: a slow client's answer may be old by now.
    if (first && this.started && !this.sync && Date.now() - this.fetchedAt > FRESH_MS) this.fetch(true);
    return () => {
      this.listeners.delete(listener);
    };
  };
}

const slots = new Map<string, Slot<unknown>>();
let watching = false;

/** Listen to the client once, for as long as the page lives. */
function watchClient() {
  if (watching) return;
  watching = true;
  client.subscribe(() => slots.forEach((s) => s.refresh()));
}

function slotFor<T>(key: string, load: (c: ApiClient) => Promise<T>): Slot<T> {
  let slot = slots.get(key) as Slot<T> | undefined;
  if (!slot) {
    slot = new Slot(key, load);
    slots.set(key, slot as Slot<unknown>);
  }
  slot.load = load;
  return slot;
}

/** Load the slots whose key starts with one of these again; with none, all of them. */
export function invalidate(...prefixes: string[]) {
  slots.forEach((slot) => {
    if (!prefixes.length || prefixes.some((p) => slot.key === p || slot.key.startsWith(`${p}:`))) slot.refresh();
  });
}

/** Drop every answer, so nothing one student saw is shown to the next. */
export function resetQueries() {
  slots.forEach((slot) => slot.reset());
}

/** Put an answer straight into a slot, for a call that returns the fresh data. */
export function seed<T>(key: string, data: T) {
  (slots.get(key) as Slot<T> | undefined)?.put(data);
}

export type Query<T> = {
  /** `loading` until there is an answer, `ready` when there is data (even if a refresh failed), else `error`. */
  status: "loading" | "ready" | "error";
  data: T | undefined;
  /** The last failure; with `ready` it means the latest refresh failed and `data` is the one before. */
  error: ApiError | null;
  refetch: () => void;
};

const OFF: Entry<never> = LOADING;

/**
 * Read one query. `enabled: false` leaves it alone (no request, always loading) for data a mode does
 * not use. The key names the data and its arguments, e.g. `results:math`.
 */
export function useQuery<T>(key: string, load: (c: ApiClient) => Promise<T>, enabled = true): Query<T> {
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

const subscribeNothing = () => () => {};
const readOff = () => OFF;

/**
 * Make a change through the client, then refresh what it touched. The live API answers with the new
 * data of the thing changed, which callers may `seed`; the mock changes its local data, which already
 * wakes every slot through `client.subscribe`.
 */
export async function change<T>(call: (c: ApiClient) => Promise<T>, touches: string[] = []): Promise<T> {
  const result = await call(client);
  if (touches.length) invalidate(...touches);
  return result;
}
