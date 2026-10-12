"use client";

import { ChevronRight, QrCode, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Mark } from "@/components/app/Mark";
import { SubjectCard } from "@/components/app/SubjectCard";
import { useUI } from "@/components/app/ui";
import { SUBJECTS } from "@/lib/app/data";
import { useAttendance } from "@/lib/app/derived";
import { useT, type Key } from "@/lib/app/i18n";

const PAGES: [string, Key][] = [
  ["/app/attendance", "att.title"],
  ["/app/summary", "sum.title"],
  ["/app/leaderboard", "lb.title"],
  ["/app/schedule", "sch.title"],
  ["/app/documents", "docs.title"],
  ["/app/achievements", "ach.title"],
  ["/app/settings", "settings.title"],
  ["/app/faq", "faq.title"],
  ["/app/scan", "home.scanTitle"],
];

export default function Home() {
  const { t } = useT();
  const router = useRouter();
  const { openDrawer } = useUI();
  const { percent } = useAttendance();
  const [q, setQ] = useState("");

  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return [];
    const all: [string, string][] = [
      ...SUBJECTS.map((s): [string, string] => [`/app/subject/${s.id}`, t(`subj.${s.id}`)]),
      ...PAGES.map(([href, key]): [string, string] => [href, t(key)]),
    ];
    return all.filter(([, label]) => label.toLowerCase().includes(needle)).slice(0, 5);
  }, [q, t]);

  return (
    <main className="screen">
      <div className="home-top">
        <button className="round" aria-label={t("nav.more")} onClick={openDrawer}>
          <span className="monogram" style={{ width: 36, height: 36, background: "var(--yellow)", color: "var(--ink)", fontSize: 13 }}>
            МТ
          </span>
        </button>
        <div className="brand" style={{ margin: 0, padding: 0 }}>
          <Mark size={44} />
          <span className="brand__name">Teacher Aid</span>
        </div>
        <span />
      </div>

      <p className="t-title" style={{ margin: "22px 0 16px" }}>
        {t("home.hello")}
      </p>

      <div className="search">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("home.search")}
          aria-label={t("home.search")}
        />
        <Search size={22} strokeWidth={2} aria-hidden="true" />
        {q.trim() && (
          <div className="results glass" role="listbox">
            {results.length === 0 && <div className="result muted">{t("home.noResults")}</div>}
            {results.map(([href, label]) => (
              <button key={href} className="result" role="option" aria-selected="false" onClick={() => router.push(href)}>
                <span className="grow">{label}</span>
                <ChevronRight size={20} strokeWidth={2} aria-hidden="true" />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="stack">
        <div className="grid2">
          <Link href="/app/schedule" className="card" style={{ padding: 16 }}>
            <div className="week">
              {(["mon", "tue", "wed"] as const).map((d, i) => (
                <div key={d}>
                  <b>{t(`day.${d}`)}</b>
                  <i>{i + 1}</i>
                  <span>{t(["kind.lesson", "kind.test", "kind.pop"][i] as Key)}</span>
                </div>
              ))}
            </div>
          </Link>
          <Link href="/app/leaderboard" className="card" style={{ padding: 16, display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 10 }}>
            <span className="t-label">{t("home.leaderboard")}</span>
            <div className="bars" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <span className="t-cap" style={{ color: "#fff", fontWeight: 650 }}>
              {t("home.rank")}
            </span>
          </Link>
        </div>

        <Link href="/app/attendance" className="card row row--between">
          <div>
            <div className="t-label">{t("home.attendance")}</div>
            <div className="t-num" style={{ marginTop: 6 }}>
              {percent}%
            </div>
          </div>
          <ChevronRight size={28} strokeWidth={2} aria-hidden="true" />
        </Link>

        <Link href="/app/summary" className="card row row--between">
          <div>
            <div className="t-label">{t("home.summary")}</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 6 }}>
              <span className="t-num">4/5</span>
              <span className="t-cap">{t("home.correct")}</span>
            </div>
          </div>
          <ChevronRight size={28} strokeWidth={2} aria-hidden="true" />
        </Link>

        <Link href="/app/scan" className="scan-cta">
          <span className="scan-cta__icon">
            <QrCode size={30} strokeWidth={2} />
          </span>
          <span className="grow">
            <span className="t-label" style={{ fontSize: 18, display: "block" }}>
              {t("home.scanTitle")}
            </span>
            <span className="t-cap">{t("home.scanSub")}</span>
          </span>
          <ChevronRight size={26} strokeWidth={2} aria-hidden="true" />
        </Link>

        <h2 className="section-h" style={{ margin: "10px 4px 0" }}>
          {t("home.subjects")}
        </h2>
        <div className="rail">
          {SUBJECTS.map((s) => (
            <SubjectCard key={s.id} subject={s} />
          ))}
        </div>
      </div>
    </main>
  );
}
