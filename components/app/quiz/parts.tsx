"use client";

import { X } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { Subject } from "@/lib/app/data";
import { useT } from "@/lib/app/i18n";
import { useQT } from "@/lib/app/quiz-copy";
import type { Quiz } from "@/lib/app/quiz";

const noop = () => () => {};
const calmNow = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
export const useCalm = () => useSyncExternalStore(noop, calmNow, () => false);

/** A number that runs from `from` to `to` once, on an ease-out. Instant under reduced motion. */
export function useCountUp(to: number, from = 0, ms = 900) {
  const calm = useCalm();
  const [value, setValue] = useState(calm ? to : from);
  useEffect(() => {
    if (calm || from === to) {
      const id = requestAnimationFrame(() => setValue(to));
      return () => cancelAnimationFrame(id);
    }
    const start = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / ms);
      setValue(Math.round(from + (to - from) * (1 - Math.pow(1 - p, 4))));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [to, from, ms, calm]);
  return value;
}

/** Close button, the progress through the quiz, and a slot on the right (the timer). */
export function QuizTop({
  onLeave,
  label,
  done,
  total,
  right,
}: {
  onLeave: () => void;
  label?: string;
  done?: number;
  total?: number;
  right?: React.ReactNode;
}) {
  const { t } = useQT();
  return (
    <header className="q-top">
      <button className="round" aria-label={t("q.leave")} onClick={onLeave}>
        <X size={24} strokeWidth={2} aria-hidden="true" />
      </button>
      <div className="q-top__mid">
        {label && <span className="q-top__label">{label}</span>}
        {total !== undefined && done !== undefined && (
          <span className="q-steps" aria-hidden="true">
            {Array.from({ length: total }, (_, i) => (
              <i key={i} data-on={i < done} />
            ))}
          </span>
        )}
      </div>
      <div className="q-top__right">{right}</div>
    </header>
  );
}

/**
 * The countdown. The ring drains on the compositor with one CSS animation started at the right
 * offset, so it stays smooth however busy the page is; the seconds count down in the middle and
 * tick for the last five.
 */
export function TimerRing({ duration, elapsedAtMount, seconds }: { duration: number; elapsedAtMount: number; seconds: number }) {
  const { t } = useQT();
  const [delay] = useState(() => -elapsedAtMount);
  return (
    <div className="q-ring" role="timer" aria-label={t("q.secondsLeft", { n: seconds })} data-low={seconds <= 5}>
      <svg viewBox="0 0 56 56" aria-hidden="true">
        <circle cx="28" cy="28" r="24" className="q-ring__track" />
        <circle
          cx="28"
          cy="28"
          r="24"
          className="q-ring__arc"
          pathLength={100}
          style={{ animationDuration: `${duration}ms`, animationDelay: `${delay}ms` }}
        />
      </svg>
      <span key={seconds <= 5 ? seconds : "n"} className="q-ring__num">
        {seconds}
      </span>
    </div>
  );
}

/** The quiz as a light subject card: what the QR opened. */
export function QuizCard({ subject, quiz, live = true }: { subject: Subject; quiz: Quiz; live?: boolean }) {
  const { t: tt, locale } = useT();
  const { t } = useQT();
  return (
    <section className="subject subject--hero tone-ice q-quizcard">
      <span className="subject__glyphs" aria-hidden="true">
        {subject.glyphs.split("  ")[0]}
      </span>
      <span className="t-label q-live">
        {live && <span className="q-live__dot" aria-hidden="true" />}
        {t("q.live")}
      </span>
      <h2 className="subject__name q-quizcard__name">{quiz.title[locale]}</h2>
      <div className="subject__foot">
        <span className="monogram" aria-hidden="true">
          {subject.initials}
        </span>
        <span>{t("q.meta", { teacher: tt(`teacher.${subject.id}`), n: quiz.questions.length })}</span>
      </div>
    </section>
  );
}

/** Ten bits of yellow and white that fly out of the badge once, for a right answer. */
export function Burst() {
  return (
    <span className="q-burst" aria-hidden="true">
      {Array.from({ length: 12 }, (_, i) => (
        <i key={i} style={{ "--a": `${i * 30 + (i % 2) * 11}deg`, "--d": `${92 + (i % 3) * 22}px` } as React.CSSProperties} />
      ))}
    </span>
  );
}

/** The check that draws itself inside the badge. */
export function CheckDraw({ size = 72 }: { size?: number }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true">
      <path className="q-draw" pathLength={1} d="M16 34 L28 46 L49 21" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CrossDraw({ size = 60 }: { size?: number }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true">
      <path className="q-draw" pathLength={1} d="M20 20 L44 44" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
      <path className="q-draw q-draw--late" pathLength={1} d="M44 20 L20 44" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
    </svg>
  );
}
