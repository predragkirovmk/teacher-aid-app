"use client";

import { useSyncExternalStore } from "react";
import type { ApiClient } from "./client";
import { isApiError } from "./errors";

/**
 * Whether the student's session is over, and why. The API says so on any call: `unauthenticated`
 * (no session, or it expired) and `signed_in_elsewhere` (BR-AUTH-03, FR-AUTH-06). A screen cannot
 * wait for its own call to find out, so every call the app makes is watched here (`watchSession`)
 * and the shell reads the answer.
 *
 * - `signed_in_elsewhere` is told to the student on a full screen of its own.
 * - `signed_out` is the student's own choice, so signing back in does not carry them to the screen
 *   they signed out on.
 * - `unauthenticated` sends them to sign in and then back to where they were.
 */
export type SessionEnd = "signed_in_elsewhere" | "signed_out" | "unauthenticated";

let end: SessionEnd | null = null;
/** Counts sign-ins, so a call that was already in flight before one cannot end the session it started. */
let epoch = 0;
const listeners = new Set<() => void>();
const onEnd = new Set<(end: SessionEnd) => void>();

const emit = () => listeners.forEach((l) => l());

export const getSessionEnd = (): SessionEnd | null => end;

export function subscribeSessionEnd(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** The reason the session is over, or null while it is not. Null on the server render and while hydrating. */
export const useSessionEnd = () => useSyncExternalStore(subscribeSessionEnd, getSessionEnd, () => null);

/** Run something once when a session ends, to forget what the student saw. Returns the way to stop. */
export function onSessionEnd(cb: (end: SessionEnd) => void) {
  onEnd.add(cb);
  return () => {
    onEnd.delete(cb);
  };
}

/** What the student is told wins over what the app guessed: another device, then their own sign-out, then a plain refusal. */
const RANK: Record<SessionEnd, number> = { signed_in_elsewhere: 3, signed_out: 2, unauthenticated: 1 };

/** The session is over. A reason never replaces a stronger one that is already set. */
export function endSession(reason: SessionEnd) {
  if (end !== null && RANK[end] >= RANK[reason]) return;
  end = reason;
  onEnd.forEach((cb) => cb(reason));
  emit();
}

/** A new session has started: forget why the last one ended. */
export function startSession() {
  epoch++;
  if (end === null) return;
  end = null;
  emit();
}

/** Turn a failed call into the end of the session when its code says so; anything else is left alone. */
export function noteFailure(error: unknown, startedAt: number = epoch) {
  if (startedAt !== epoch || !isApiError(error)) return;
  if (error.code === "signed_in_elsewhere" || error.code === "unauthenticated") endSession(error.code);
}

const WATCHED_NOT: readonly (keyof ApiClient)[] = ["subscribe", "startSignIn", "signOut"];

/**
 * The same client, with every call that could say "your session is over" listened to. The promise
 * each call returns is the adapter's own (a mock answer keeps its `settled` mark), so nothing changes
 * for the caller. Sign-in and sign-out are left out: a refusal there is about the attempt, not the session.
 */
export function watchSession(client: ApiClient): ApiClient {
  const watched: Record<string, unknown> = {};
  for (const key of Object.keys(client) as (keyof ApiClient)[]) {
    const fn = client[key] as (...args: unknown[]) => unknown;
    watched[key] = WATCHED_NOT.includes(key)
      ? fn
      : (...args: unknown[]) => {
          const startedAt = epoch;
          const result = fn(...args);
          (result as Promise<unknown>).then(undefined, (e: unknown) => noteFailure(e, startedAt));
          return result;
        };
  }
  return watched as unknown as ApiClient;
}
