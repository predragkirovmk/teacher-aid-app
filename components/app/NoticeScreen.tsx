"use client";

import { BuildingsIcon, EnvelopeSimpleIcon, EyeIcon, ShieldCheckIcon, WarningCircleIcon, type Icon } from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Mark } from "@/components/app/Mark";
import { useUI } from "@/components/app/ui";
import { acknowledgeNotice, signOut } from "@/lib/app/api/hooks";
import { errorCopy, useT, type Key } from "@/lib/app/i18n";
import { NOTICE_VERSION } from "@/lib/app/privacy";

const POINTS: { icon: Icon; text: Key }[] = [
  { icon: BuildingsIcon, text: "notice.b1" },
  { icon: EyeIcon, text: "notice.b2" },
  { icon: ShieldCheckIcon, text: "notice.b3" },
  { icon: EnvelopeSimpleIcon, text: "notice.b4" },
];

/**
 * The screen a student sees after their first sign-in, and again when the privacy notice or the terms change: a short version,
 * a way to read both in full, and one Continue. The school is the controller and decides the lawful basis (spec 1.3, 13.4), so this
 * informs; Continue records only that the student was shown this version (`POST /me/acknowledgements`), and the screen says so.
 * There is no checkbox, because nothing here is a consent. A student who would rather not go on can sign out.
 */
export function NoticeScreen({ updated }: { updated: boolean }) {
  const { t } = useT();
  const { toast } = useUI();
  const cta = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  // The one thing to do is the first thing a keyboard reaches.
  useEffect(() => {
    cta.current?.focus({ preventScroll: true });
  }, []);

  async function carryOn() {
    if (busy) return;
    setBusy(true);
    setProblem(null);
    try {
      // The shell sees the new acknowledgement and gives way to the screen that was asked for.
      await acknowledgeNotice(NOTICE_VERSION);
    } catch (e) {
      setProblem(errorCopy(t, e));
      setBusy(false);
    }
  }

  return (
    <main className="screen screen--bare notice" aria-labelledby="notice-title">
      <header className="notice__top">
        <span className="notice__brand">
          <Mark size={44} />
          <span className="brand__name">TeacherAid</span>
        </span>
        {/* A way out for a student who would rather not go on, quiet and out of the way of Continue. */}
        <button className="btn btn--plain notice__out" onClick={() => signOut().catch((e) => toast(errorCopy(t, e)))}>
          {t("drawer.logout")}
        </button>
      </header>
      <div className="notice__body">
        <h1 id="notice-title" className="t-display">
          {t(updated ? "notice.titleUpdated" : "notice.title")}
        </h1>
        <p className="t-body muted notice__sub">{t(updated ? "notice.subUpdated" : "notice.sub")}</p>
        <ul className="notice__points">
          {POINTS.map(({ icon: Glyph, text }) => (
            <li key={text} className="notice__point">
              <Glyph size={24} aria-hidden="true" />
              <span>{t(text)}</span>
            </li>
          ))}
        </ul>
        <div className="notice__links">
          <Link href="/app/privacy" className="btn btn--plain">
            {t("notice.readPrivacy")}
          </Link>
          <Link href="/app/terms" className="btn btn--plain">
            {t("notice.readTerms")}
          </Link>
        </div>
      </div>
      <footer className="notice__foot">
        {problem && (
          <p className="pe-err notice__err" role="alert">
            <WarningCircleIcon size={20} color="var(--yellow)" aria-hidden="true" />
            {problem}
          </p>
        )}
        <button ref={cta} className="btn btn--primary btn--block" aria-busy={busy} onClick={carryOn}>
          {t("notice.continue")}
        </button>
        <p className="t-cap notice__small">{t("notice.foot")}</p>
      </footer>
    </main>
  );
}
