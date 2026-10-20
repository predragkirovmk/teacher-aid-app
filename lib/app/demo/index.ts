"use client";

import { useMemo, useSyncExternalStore } from "react";
import { demoOnly } from "../api";
import { useAttendance } from "../api/hooks";
import type { TFn } from "../i18n";
import { CLASS_SUBJECTS, DOCS, MOCK_CODE, MOCK_ROSTER, NOTIFS, SUBJECTS } from "../api/mock/data";
import { actions, useApp } from "../api/mock/store";
import { ROOMS, demoTime, type ClockId, type Scan } from "./schedule";

export * from "./schedule";

/**
 * What only the demo has: the timetable, the demo clock, the documents list and the test QR codes.
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

/** The student's check-ins by QR, for matching them to lessons. */
export function useScans(): Scan[] {
  const q = useAttendance();
  return useMemo(
    () => (q.data?.log ?? []).flatMap((e) => (e.joinedAt === null ? [] : [{ subjectId: e.subjectId, at: e.joinedAt }])),
    [q.data],
  );
}

/** Where a subject is taught: its room, or the gym. */
export const roomLabel = (t: TFn, subjectId: string) => {
  const room = ROOMS[subjectId];
  return room === "gym" ? t("home.gym") : t("home.room", { n: room });
};

/** Clear the demo's check-ins, read alerts, points and achievements; the language stays. */
export const resetDemo = () => actions.reset();

/** The demo's stand-in for the same account signing in on another phone (BR-AUTH-03): this one is signed out. */
export const signInElsewhere = () => actions.signOutElsewhere();

/** What the welcome screen's demo hint offers in place of a school mailbox: a roster email and the code it "receives". */
export const DEMO_SIGN_IN = { email: MOCK_ROSTER[0], code: MOCK_CODE };

/** The class QR codes the test kit prints, one for each subject that has a live quiz. */
export const CLASS_CODES = CLASS_SUBJECTS.map((s) => ({ subjectId: s.id, code: s.code }));

export const DEMO_DOCS = DOCS;

/** Screens the offline worker should keep, which only the demo knows the names of. */
export const demoRoutes = () => [
  ...SUBJECTS.map((s) => `/app/subject/${s.id}`),
  ...CLASS_SUBJECTS.flatMap((s) => [`/app/play/${s.code}`, `/app/checkin/${s.code}`]),
  ...NOTIFS.map((n) => `/app/notifications/${n.id}`),
];
