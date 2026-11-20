"use client";

import { useSyncExternalStore } from "react";
import { demoOnly } from "../api";
import { CLASS_SUBJECTS, DOCS, NOTIFS } from "../api/mock/data";
import { actions, useApp } from "../api/mock/store";
import { demoTime, type ClockId } from "./schedule";

export * from "./schedule";

/**
 * What only the demo has: the demo clock, the documents list and the test QR codes.
 * The spec has no API for them, so a screen reaches for this module only behind `demoOnly`.
 */

/** The demo time choice, and the way to change it. */
export function useDemoClock() {
  const { clock } = useApp();
  return { clock, setClock: (next: ClockId) => actions.setClock(next) };
}

const minute = () => Math.floor(Date.now() / 60_000) * 60_000;
function tick(cb: () => void) {
  const id = setInterval(cb, 15_000);
  document.addEventListener("visibilitychange", cb);
  return () => {
    clearInterval(id);
    document.removeEventListener("visibilitychange", cb);
  };
}

/** The phone's time, to the minute. Null while hydrating: the server cannot know the phone's clock. */
export const useRealNow = () => useSyncExternalStore(tick, minute, () => null);

/** Now as the demo sees it: the phone's time, or the moment picked as demo time. */
export function useNow(): number | null {
  const { clock } = useDemoClock();
  const real = useRealNow();
  return real === null ? null : demoOnly ? demoTime(clock, real) : real;
}

/** Clear the demo's check-ins, read alerts, points and achievements; the language stays. */
export const resetDemo = () => actions.reset();

/** The demo's stand-in for the same account signing in on another phone (BR-AUTH-03): this one is signed out. */
export const signInElsewhere = () => actions.signOutElsewhere();

/** The demo's stand-in for the provider's sign-in page and the API's callback behind it (mock/signin.ts). */
export { finishMockSignIn as finishDemoSignIn, type DemoAccount } from "../api/mock/signin";

/** Take back the acknowledgement of the privacy notice, as for a student who has not signed in before: the notice shows again. */
export const showNoticeAgain = () => actions.acknowledgeNotice(null);

/** The class QR codes the test kit prints, one for each class that has a live quiz. */
export const CLASS_CODES = CLASS_SUBJECTS.map((s) => ({ code: s.code }));

export const DEMO_DOCS = DOCS;

/** Screens the offline worker should keep, which only the demo knows the names of. */
export const demoRoutes = () => [
  ...CLASS_SUBJECTS.flatMap((s) => [`/app/play/${s.code}`, `/app/checkin/${s.code}`]),
  ...NOTIFS.map((n) => `/app/notifications/${n.id}`),
  "/app/practice/ps-session-math-1",
  "/app/practice/ps-session-phys-2",
];
