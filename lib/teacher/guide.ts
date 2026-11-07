import type { Key } from "./i18n";

/**
 * The guided first lesson, as far as this app can show it before the screens it points at exist (FR-SUP-03, F-01 step 3):
 * three short steps, the three things a teacher does with TeacherAid, in the order they do them (F-03, F-06, F-10). The guide
 * only tells; it does not run a lesson. Finishing or skipping it marks the first run done.
 */
export const GUIDE_STEPS = [
  { title: "guide.1.title", body: "guide.1.body", icon: "prepare" },
  { title: "guide.2.title", body: "guide.2.body", icon: "hold" },
  { title: "guide.3.title", body: "guide.3.body", icon: "review" },
] as const satisfies readonly { title: Key; body: Key; icon: string }[];

export type GuideIcon = (typeof GUIDE_STEPS)[number]["icon"];

/** The step after moving by `by` steps, kept inside the guide. */
export const stepAfter = (step: number, by: 1 | -1): number => Math.min(GUIDE_STEPS.length - 1, Math.max(0, step + by));

/** Whether the step is the last one, where Next becomes the way out. */
export const isLastStep = (step: number): boolean => step >= GUIDE_STEPS.length - 1;
