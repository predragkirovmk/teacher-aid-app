"use client";

import { useSyncExternalStore } from "react";
import type { TeacherApi } from "./client";
import { isApiError } from "./errors";
import type { EndReason } from "../guard";

/**
 * Whether the teacher's session is over, and why. The API says so on any call, `unauthenticated` (401), and a screen cannot
 * wait for its own call to find out, so every call the app makes is watched here (`watchSession`) and the gate reads the answer.
 *
 * - `expired`: the session ended while the teacher was working (it timed out, or they signed out on another computer). Only
 *   said once the app has seen the teacher signed in: a first visit with no session is not "we signed you out".
 * - `signed_out`: the teacher's own choice, so signing in again does not carry them back to the screen they left.
 */
let end: EndReason | null = null;
/** Set once `GET /me` has answered with a teacher: from then on a refusal is the end of a session, not the start of a visit. */
let seen = false;
const listeners = new Set<() => void>();
const onEnd = new Set<(reason: EndReason) => void>();

const emit = () => listeners.forEach((l) => l());

export const getSessionEnd = (): EndReason | null => end;

export function subscribeSessionEnd(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** The reason the session is over, or null while it is not. Null on the server render and while hydrating. */
export const useSessionEnd = () => useSyncExternalStore(subscribeSessionEnd, getSessionEnd, () => null);

/** Run something once when a session ends, to forget what the teacher saw. Returns the way to stop. */
export function onSessionEnd(cb: (reason: EndReason) => void) {
  onEnd.add(cb);
  return () => {
    onEnd.delete(cb);
  };
}

/** The teacher's own choice wins over a guess that the session ran out. */
const RANK: Record<EndReason, number> = { signed_out: 2, expired: 1 };

/** The session is over. A reason never replaces a stronger one that is already set. */
export function endSession(reason: EndReason) {
  if (end !== null && RANK[end] >= RANK[reason]) return;
  end = reason;
  onEnd.forEach((cb) => cb(reason));
  emit();
}

/** A failed call ends the session when it was `unauthenticated` and the teacher had been signed in; anything else is left alone. */
export function noteFailure(error: unknown) {
  if (seen && isApiError(error) && error.code === "unauthenticated") endSession("expired");
}

/** `GET /me` answered with a teacher. */
export const noteSignedIn = () => {
  seen = true;
};

/** For the tests: forget everything, as a page load does. */
export function resetSession() {
  end = null;
  seen = false;
}

/** Calls whose refusal is about the attempt and not about the session. */
const NOT_WATCHED: readonly (keyof TeacherApi)[] = ["subscribe", "startSignIn", "signOut", "openChannel"];

/**
 * The same adapter, with every call that could say "your session is over" listened to. The promise each call returns is the
 * adapter's own (a mock answer keeps its `settled` mark), so nothing changes for the caller. The listening is a second
 * handler on the promise, which runs after the render that read it, never during.
 */
export function watchSession(api: TeacherApi): TeacherApi {
  const watched: Record<string, unknown> = {};
  for (const key of Object.keys(api) as (keyof TeacherApi)[]) {
    const fn = api[key] as (...args: unknown[]) => unknown;
    watched[key] = NOT_WATCHED.includes(key)
      ? fn
      : (...args: unknown[]) => {
          const result = fn(...args) as Promise<unknown>;
          result.then(key === "getMe" ? noteSignedIn : undefined, noteFailure);
          return result;
        };
  }
  return watched as unknown as TeacherApi;
}
