"use client";

import { ArrowLeftIcon, ArrowRightIcon, CalendarCheckIcon, FileTextIcon, GearSixIcon, ListChecksIcon, QrCodeIcon, type Icon } from "@phosphor-icons/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Mark } from "@/components/app/Mark";
import { setFirstRunDone, useMe } from "@/lib/teacher/api/hooks";
import { leaveGuideUnsaved } from "@/lib/teacher/first-run";
import { GUIDE_STEPS, isLastStep, stepAfter, type GuideIcon } from "@/lib/teacher/guide";
import { useT } from "@/lib/teacher/i18n";
import { SETTINGS } from "@/lib/teacher/routes";
import { safeNext, TODAY } from "@/lib/teacher/signin";
import { PageTitle } from "./PageTitle";
import { Problem } from "./Problem";

const ICONS: Record<GuideIcon, Icon> = { prepare: FileTextIcon, hold: QrCodeIcon, review: ListChecksIcon };

/**
 * The welcome guide of a first run: three short steps, one thing each, with Next, a labelled Back and "Skip the guide" always
 * in view. Finishing or skipping marks the first run done (FR-SUP-03) and lands on Today, where the one yellow button is
 * "Prepare a lesson", or on the screen the first sign-in was heading for. It is also reached again from Settings, where
 * finishing or skipping changes nothing on the server and goes back to Settings, and says so.
 */
export function Guide() {
  const { t, te } = useT();
  const router = useRouter();
  const done = useMe().data?.first_run_done;
  // Where the guide goes on to: the screen the first sign-in was heading for, or Settings when it is shown again from there.
  const next = safeNext(useSearchParams().get("next")) ?? TODAY;
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const moved = useRef(false);

  // A new step starts at its title, which is what a screen reader then reads. Not on the first draw: the page title is read then.
  useEffect(() => {
    if (moved.current) heading.current?.focus();
    moved.current = true;
  }, [step]);

  const goOn = () => router.replace(next);

  const leave = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (done === false) await setFirstRunDone();
      goOn();
    } catch (e) {
      // Not saved: stay, say why, and the same button tries again. Going on is the teacher's to choose, below.
      setError(e);
      setBusy(false);
    }
  };

  // The save keeps failing and the teacher would rather get on: every page would send them back here, so the gate is told not to.
  const goOnAnyway = () => {
    leaveGuideUnsaved();
    goOn();
  };

  const current = GUIDE_STEPS[step];
  const Glyph = ICONS[current.icon];
  const last = isLastStep(step);

  return (
    <main className="entry">
      <PageTitle title={t("guide.title")} />
      <header className="entry__top">
        <span className="brand__link">
          <Mark size={44} />
          <span className="brand__word">TeacherAid</span>
        </span>
      </header>

      <div className="entry__body">
        <div className="card card--stack entry__card guide">
          <h1>{t("guide.title")}</h1>
          <p className="guide__step">{t("guide.step", { n: step + 1, total: GUIDE_STEPS.length })}</p>
          <div className="guide__bars" aria-hidden="true">
            {GUIDE_STEPS.map((_, i) => (
              <span key={i} data-on={i <= step} />
            ))}
          </div>

          <div className="guide__head">
            <span className="card__icon">
              <Glyph size={40} aria-hidden="true" />
            </span>
            <h2 tabIndex={-1} ref={heading} className="guide__title">
              {t(current.title)}
            </h2>
          </div>
          <p className="guide__body">{t(current.body)}</p>

          {error !== null && <Problem title={t("guide.error.title")}>{te(error)}</Problem>}

          <div className="guide__actions">
            {step > 0 && (
              <button type="button" className="btn btn--secondary" disabled={busy} onClick={() => setStep(stepAfter(step, -1))}>
                <ArrowLeftIcon size={24} aria-hidden="true" />
                {t("back")}
              </button>
            )}
            {last ? (
              <button type="button" className="btn btn--primary" aria-busy={busy} disabled={busy} onClick={() => void leave()}>
                {next === SETTINGS ? <GearSixIcon size={24} weight="bold" aria-hidden="true" /> : <CalendarCheckIcon size={24} weight="bold" aria-hidden="true" />}
                {next === SETTINGS ? t("guide.done.settings") : t("guide.done")}
              </button>
            ) : (
              <button type="button" className="btn btn--primary" onClick={() => setStep(stepAfter(step, 1))}>
                {t("guide.next")}
                <ArrowRightIcon size={24} weight="bold" aria-hidden="true" />
              </button>
            )}
          </div>
          {(!last || error !== null) && (
            <div className="guide__quiet">
              {!last && (
                <button type="button" className="btn btn--quiet" disabled={busy} aria-busy={busy} onClick={() => void leave()}>
                  {t("guide.skip")}
                </button>
              )}
              {error !== null && (
                <button type="button" className="btn btn--quiet" onClick={goOnAnyway}>
                  {t("guide.anyway")}
                </button>
              )}
            </div>
          )}
          {/* Told to a teacher who has not seen the guide before; one who is looking at it from Settings knows. */}
          {!last && error === null && done === false && <p className="guide__note">{t("guide.note")}</p>}
        </div>
      </div>
    </main>
  );
}
