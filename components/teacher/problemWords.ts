import type { Problem } from "@/lib/teacher/editor";
import { useT } from "@/lib/teacher/i18n";
import { TIMER_MAX_SECONDS, TIMER_MIN_SECONDS } from "@/lib/teacher/lessons";
import { QUESTIONS_MAX, QUESTIONS_MIN } from "@/lib/teacher/scoring";

/** What is wrong with a lesson, in the plain words of `problem.<code>`: the question's number, which answer, the limits. */
export function problemWords(t: ReturnType<typeof useT>["t"], p: Problem): string {
  const timer = p.code === "timer_range";
  return t(`problem.${p.code}`, {
    n: p.n ?? 0,
    option: p.option ?? 0,
    count: p.count ?? 0,
    min: timer ? TIMER_MIN_SECONDS : QUESTIONS_MIN,
    max: timer ? TIMER_MAX_SECONDS : QUESTIONS_MAX,
  });
}
