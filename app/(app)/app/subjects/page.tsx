"use client";

import { CaretRightIcon, MagnifyingGlassIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { Gate } from "@/components/app/QueryState";
import { MotionList } from "@/components/app/MotionList";
import { SubjectRow } from "@/components/app/SubjectCard";
import { demoOnly } from "@/lib/app/api";
import { useCourses } from "@/lib/app/api/hooks";
import type { Course } from "@/lib/app/api/types";
import { hasKey, translate, useT, type Key } from "@/lib/app/i18n";
import { personName } from "@/lib/app/quiz";

const PAGES: [string, Key][] = [
  ["/app/attendance", "att.title"],
  ["/app/summary", "res.title"],
  ["/app/practice", "pr.title"],
  ["/app/leaderboard", "lb.title"],
  ...(demoOnly
    ? ([
        ["/app/schedule", "sch.title"],
        ["/app/documents", "docs.title"],
      ] as [string, Key][])
    : []),
  ["/app/achievements", "ach.title"],
  ["/app/settings", "settings.title"],
  ["/app/faq", "faq.title"],
  ["/app/scan", "home.scanTitle"],
];

/** A tab root's large title, as on Home, Alerts and Profile: no Back, the tab bar is the way out. */
function Title() {
  const { t } = useT();
  return (
    <h1 className="large" style={{ marginTop: 16 }}>
      {t("subjects.title")}
    </h1>
  );
}

/** Everything a course can be found by, in both languages: the subject's names, the teacher's and Latin spellings. */
function terms(course: Course): string[] {
  const key = `subj.${course.subjectId}`;
  const known = hasKey(key) ? (["en", "mk"] as const).map((l) => translate(l, key)) : [];
  return [...known, course.subjectName, course.teacherName, personName(course.teacherName, "en"), ...(course.searchTerms ?? [])].map((s) =>
    s.toLowerCase(),
  );
}

/**
 * Every subject. The search narrows the list itself, by subject or teacher, and also finds the
 * app's other screens, which it lists in a group of their own under the subjects.
 */
export default function Subjects() {
  const courses = useCourses();
  return (
    <Gate query={courses} header={<Title />}>
      {(all) => <SubjectList all={all} />}
    </Gate>
  );
}

/**
 * A row that rises in if it was not on screen before the search changed, and stays as it was otherwise: the class is fixed
 * when the row mounts, so the rows that are still listed do not replay on the next keystroke. `i` counts the new rows only.
 */
function Found({ fresh, i, children }: { fresh: boolean; i: number; children: ReactNode }) {
  const [rises] = useState(fresh);
  return (
    <li className={rises ? "arrive" : undefined} style={rises ? ({ "--i": i } as CSSProperties) : undefined}>
      {children}
    </li>
  );
}

function SubjectList({ all }: { all: Course[] }) {
  const { t } = useT();
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  // Match in both languages, so typing "math" finds Математика and the other way round.
  const matches = (key: Key) => (["en", "mk"] as const).some((l) => translate(l, key).toLowerCase().includes(needle));
  const subjects = needle ? all.filter((c) => terms(c).some((s) => s.includes(needle))) : all;
  const pages = needle ? PAGES.filter(([, key]) => matches(key)) : [];
  const count = subjects.length + pages.length;
  // What was listed last time: only a row that was not takes the entrance. The first list, on opening the tab, is all known.
  const [listed] = useState(() => new Set(all.map((c) => c.id)));
  const ids = [...subjects.map((c) => c.id), ...pages.map(([href]) => href)];
  useEffect(() => {
    listed.clear();
    ids.forEach((id) => listed.add(id));
  });
  let fresh = 0;
  const arrival = (id: string) => {
    const isNew = !listed.has(id);
    return { fresh: isNew, i: isNew ? fresh++ : 0 };
  };
  const found = !needle
    ? ""
    : count === 0
      ? t("home.noResults")
      : count === 1
        ? t("home.results.one")
        : t("home.results.other", { n: count });

  return (
    <main className="screen">
      <Title />
      <div className="search">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("home.search")}
          aria-label={t("home.search")}
          enterKeyHint="search"
        />
        <MagnifyingGlassIcon size={22} aria-hidden="true" />
        <p className="sr" role="status">
          {found}
        </p>
      </div>

      {/* Always mounted, so the last rows of a search that finds nothing still fade out; an empty list takes no room. */}
      <MotionList>
        {subjects.map((c) => (
          <Found key={c.id} {...arrival(c.id)}>
            <SubjectRow course={c} />
          </Found>
        ))}
      </MotionList>
      {pages.length > 0 && (
        <>
          <h2 className="section-h">{t("subjects.pages")}</h2>
          <MotionList>
            {pages.map(([href, key]) => (
              <Found key={href} {...arrival(href)}>
                <Link href={href} className="item" transitionTypes={["nav-forward"]}>
                  <span className="grow item__title">{t(key)}</span>
                  <CaretRightIcon size={22} aria-hidden="true" />
                </Link>
              </Found>
            ))}
          </MotionList>
        </>
      )}
      {needle && count === 0 && (
        <p className="t-cap arrive" aria-hidden="true" style={{ textAlign: "center", marginTop: 24 }}>
          {t("home.noResults")}
        </p>
      )}
    </main>
  );
}
