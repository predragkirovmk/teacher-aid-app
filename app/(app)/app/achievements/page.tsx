"use client";

import { FlameIcon, HandIcon, LockIcon, MedalIcon, StarIcon, type Icon } from "@phosphor-icons/react";
import { useEffect, useSyncExternalStore } from "react";
import { Top } from "@/components/app/Top";
import { ACHIEVEMENTS, type AchievementId } from "@/lib/app/data";
import { BADGE_POINTS, useAchievements } from "@/lib/app/derived";
import { useT } from "@/lib/app/i18n";

const noop = () => () => {};
const SEEN_KEY = "teacheraid-achievements-seen";
// The raw string, so the snapshot is stable between renders.
const readSeen = () => {
  try {
    return window.localStorage.getItem(SEEN_KEY) ?? "";
  } catch {
    return "";
  }
};

const ICON: Record<AchievementId, Icon> = { answer: HandIcon, ontime: MedalIcon, streak: FlameIcon, perfect: StarIcon };

export default function Achievements() {
  const { t } = useT();
  const got = useAchievements();
  const n = ACHIEVEMENTS.filter((a) => got[a]).length;
  const seen = useSyncExternalStore(noop, readSeen, () => "*").split(",");
  const fresh = (a: AchievementId) => a !== "ontime" && got[a] && !seen.includes(a) && !seen.includes("*");

  // Mark them seen once the unlock has played, so it only happens the first time.
  useEffect(() => {
    const id = setTimeout(() => {
      try {
        window.localStorage.setItem(SEEN_KEY, ACHIEVEMENTS.filter((a) => got[a]).join(","));
      } catch {
        // ignore
      }
    }, 1600);
    return () => clearTimeout(id);
  }, [got]);

  return (
    <main className="screen">
      <Top title={t("ach.title")} />
      <p className="t-cap sub">{t("ach.sub", { n })}</p>
      <ul className="list">
        {ACHIEVEMENTS.map((a) => {
          const Icon = ICON[a];
          const on = got[a];
          return (
            <li key={a} className="item" style={{ minHeight: 84 }}>
              <span className={`item__icon${fresh(a) ? " unlock" : ""}`} style={on ? { background: "var(--yellow)", color: "var(--ink)" } : undefined}>
                {on ? <Icon size={22} /> : <LockIcon size={22} />}
              </span>
              <span className="grow item__main">
                <span className="item__text">
                  <span className="item__title" style={{ display: "block" }}>
                    {t(`ach.${a}.title`)}
                  </span>
                  <span className="t-cap">
                    {t(`ach.${a}.body`)} {t("ach.points", { n: BADGE_POINTS })}
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
