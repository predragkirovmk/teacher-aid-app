"use client";

import { Award, Flame, Lock, ScanLine, Star, type LucideIcon } from "lucide-react";
import { Top } from "@/components/app/Top";
import { ACHIEVEMENTS, type AchievementId } from "@/lib/app/data";
import { useAchievements } from "@/lib/app/derived";
import { useT } from "@/lib/app/i18n";

const ICON: Record<AchievementId, LucideIcon> = { first: ScanLine, ontime: Award, streak: Flame, perfect: Star };

export default function Achievements() {
  const { t } = useT();
  const got = useAchievements();
  const n = ACHIEVEMENTS.filter((a) => got[a]).length;

  return (
    <main className="screen">
      <Top title={t("ach.title")} />
      <p className="t-cap sub">{t("ach.sub", { n })}</p>
      <ul className="list" style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {ACHIEVEMENTS.map((a) => {
          const Icon = ICON[a];
          const on = got[a];
          return (
            <li key={a} className={`item${on ? " item--me" : ""}`} style={{ minHeight: 84 }}>
              <span className="item__icon" style={on ? { background: "var(--ink)", color: "var(--yellow)" } : undefined}>
                {on ? <Icon size={22} strokeWidth={2} /> : <Lock size={22} strokeWidth={2} />}
              </span>
              <span className="grow">
                <span className="item__title" style={{ display: "block" }}>
                  {t(`ach.${a}.title`)}
                </span>
                <span className="t-cap">{t(`ach.${a}.body`)}</span>
              </span>
              <span className="status">{on ? t("ach.unlocked") : t("ach.locked")}</span>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
