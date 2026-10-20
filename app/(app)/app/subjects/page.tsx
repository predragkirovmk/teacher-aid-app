"use client";

import { CaretRightIcon, MagnifyingGlassIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { useState } from "react";
import { Gate } from "@/components/app/QueryState";
import { SubjectRow } from "@/components/app/SubjectCard";
import { Top } from "@/components/app/Top";
import { demoOnly } from "@/lib/app/api";
import { useCourses } from "@/lib/app/api/hooks";
import type { Course } from "@/lib/app/api/types";
import { hasKey, translate, useT, type Key } from "@/lib/app/i18n";
import { personName } from "@/lib/app/quiz";

const PAGES: [string, Key][] = [
  ["/app/attendance", "att.title"],
  ["/app/summary", "sum.title"],
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
  const { t } = useT();
  const courses = useCourses();
  return (
    <Gate query={courses} header={<Top title={t("subjects.title")} />}>
      {(all) => <SubjectList all={all} />}
    </Gate>
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
  const found = !needle
    ? ""
    : count === 0
      ? t("home.noResults")
      : count === 1
        ? t("home.results.one")
        : t("home.results.other", { n: count });

  return (
    <main className="screen">
      <Top title={t("subjects.title")} />
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

      {subjects.length > 0 && (
        <ul className="list">
          {subjects.map((c) => (
            <li key={c.id}>
              <SubjectRow course={c} />
            </li>
          ))}
        </ul>
      )}
      {pages.length > 0 && (
        <>
          <h2 className="section-h">{t("subjects.pages")}</h2>
          <ul className="list">
            {pages.map(([href, key]) => (
              <li key={href}>
                <Link href={href} className="item">
                  <span className="grow item__title">{t(key)}</span>
                  <CaretRightIcon size={22} aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
      {needle && count === 0 && (
        <p className="t-cap" aria-hidden="true" style={{ textAlign: "center", marginTop: 24 }}>
          {t("home.noResults")}
        </p>
      )}
    </main>
  );
}
