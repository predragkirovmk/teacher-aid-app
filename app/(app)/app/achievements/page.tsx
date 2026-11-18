"use client";

import { LockIcon } from "@phosphor-icons/react";
import { useEffect, useLayoutEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { Gate } from "@/components/app/QueryState";
import { Top } from "@/components/app/Top";
import { demoOnly } from "@/lib/app/api";
import { useBadges } from "@/lib/app/api/hooks";
import type { Badge } from "@/lib/app/api/types";
import { badgeCopy, badgeIcon } from "@/lib/app/badges";
import { Confetti } from "@/components/app/Confetti";
import { HAPTICS, buzz } from "@/lib/app/haptics";
import { useT } from "@/lib/app/i18n";

const noop = () => () => {};
/** The delay of `.unlock`'s pop in app.css: the buzz waits as long, so it lands as the badge starts to pop. */
const POP_DELAY_MS = 250;
const SEEN_KEY = "teacheraid-achievements-seen";
// The raw string, so the snapshot is stable between renders.
const readSeen = () => {
  try {
    return window.localStorage.getItem(SEEN_KEY) ?? "";
  } catch {
    return "";
  }
};

/** Badges the spec has no API for: the demo's streak. */
const DEMO_ONLY_BADGES = ["streak"];
/** The badge the demo starts with: it unlocks nothing on first sight. */
const STARTING_BADGE = "ontime";

export default function Achievements() {
  const { t } = useT();
  const badges = useBadges();
  return (
    <Gate query={badges} header={<Top title={t("ach.title")} />}>
      {(all) => <BadgeList all={all} />}
    </Gate>
  );
}

function BadgeList({ all }: { all: Badge[] }) {
  const { t } = useT();
  const list = useMemo(() => all.filter((b) => demoOnly || !DEMO_ONLY_BADGES.includes(b.code)), [all]);
  const n = list.filter((b) => b.earned).length;
  const seen = useSyncExternalStore(noop, readSeen, () => "*").split(",");
  const fresh = (b: Badge) => b.earned && !(demoOnly && b.code === STARTING_BADGE) && !seen.includes(b.code) && !seen.includes("*");

  // One short double as the badge starts to pop, however many badges are new. A layout effect runs in the commit, inside the screen's
  // view transition (a passive effect would wait for the slide to end); the ref is set when the buzz fires, so a remount buzzes once.
  const buzzed = useRef(false);
  const anyFresh = list.some(fresh);
  useLayoutEffect(() => {
    if (!anyFresh || buzzed.current) return;
    const id = setTimeout(() => {
      buzzed.current = true;
      buzz(HAPTICS.badge);
    }, POP_DELAY_MS);
    return () => clearTimeout(id);
  }, [anyFresh]);

  // Mark them seen once the unlock has played, so it only happens the first time.
  useEffect(() => {
    const id = setTimeout(() => {
      try {
        window.localStorage.setItem(SEEN_KEY, list.filter((b) => b.earned).map((b) => b.code).join(","));
      } catch {
        // ignore
      }
    }, 1600);
    return () => clearTimeout(id);
  }, [list]);

  return (
    <main className="screen">
      <Top title={t("ach.title")} />
      <p className="t-cap sub">{t("ach.sub", { n, total: list.length })}</p>
      <ul className="list">
        {list.map((b) => {
          const Icon = badgeIcon(b.code);
          const on = b.earned;
          const copy = badgeCopy(t, b);
          return (
            <li key={b.code} className="item" style={{ minHeight: 84 }}>
              <span className={`item__icon${fresh(b) ? " unlock" : ""}`} style={on ? { background: "var(--yellow)", color: "var(--ink)" } : undefined}>
                {fresh(b) && <Confetti count={20} />}
                {on ? <Icon size={22} /> : <LockIcon size={22} />}
              </span>
              <span className="grow item__main">
                <span className="item__text">
                  <span className="item__title" style={{ display: "block" }}>
                    {copy.title}
                  </span>
                  <span className="t-cap">
                    {copy.body} {t("ach.points", { n: b.points })}
                  </span>
                </span>
                <span className="status">{on ? t("ach.unlocked") : t("ach.locked")}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
