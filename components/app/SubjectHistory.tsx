"use client";

import { useState } from "react";
import { PracticeRow } from "@/components/app/practice/PracticeRows";
import { ResultList } from "@/components/app/Results";
import { TopicCard } from "@/components/app/TopicChart";
import { usePracticeSets, useResults, useTopics } from "@/lib/app/api/hooks";
import type { Course } from "@/lib/app/api/types";
import { useT } from "@/lib/app/i18n";
import { topicsOf } from "@/lib/app/topics";

/** Practice sets the teacher of this subject sent, the unfinished ones first. Nothing is drawn while there are none. */
export function SubjectPractice({ course }: { course: Course }) {
  const { t } = useT();
  const sets = usePracticeSets();
  const mine = (sets.data ?? []).filter((s) => s.courseId === course.id);
  if (mine.length === 0) return null;
  return (
    <section>
      <div className="section-row">
        <h2 className="section-h">{t("pr.title")}</h2>
      </div>
      <ul className="list">
        {mine.map((s) => (
          <li key={s.id}>
            <PracticeRow set={s} withSubject={false} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The last few lessons of this subject with their score, and the rest one tap away. */
export function SubjectResults({ course }: { course: Course }) {
  const { t } = useT();
  const results = useResults(course.id);
  const [all, setAll] = useState(false);
  if (results.status !== "ready") return null;
  const list = results.data ?? [];
  const RECENT = 3;
  return (
    <section>
      <div className="section-row">
        <h2 className="section-h">{t("res.recent")}</h2>
      </div>
      {list.length === 0 ? (
        <p className="muted t-cap" style={{ margin: "0 4px" }}>
          {t("res.none")}
        </p>
      ) : (
        <>
          <ResultList results={all ? list : list.slice(0, RECENT)} withSubject={false} />
          {list.length > RECENT && (
            <button className="btn btn--plain btn--block" aria-expanded={all} onClick={() => setAll(!all)}>
              {all ? t("res.less") : t("res.all", { n: list.length })}
            </button>
          )}
        </>
      )}
    </section>
  );
}

/** How the student has done on each topic of this subject, lesson by lesson. */
export function SubjectTopics({ course }: { course: Course }) {
  const { t } = useT();
  const topics = useTopics();
  const mine = topicsOf(topics.data ?? [], course.subjectId);
  if (mine.length === 0) return null;
  return (
    <section>
      <div className="section-row">
        <h2 className="section-h">{t("topic.title")}</h2>
      </div>
      <p className="t-cap muted" style={{ margin: "0 4px 8px" }}>
        {t("topic.sub")}
      </p>
      <ul className="list">
        {mine.map((topic) => (
          <li key={`${topic.subjectId}:${topic.topic}`}>
            <TopicCard topic={topic} />
          </li>
        ))}
      </ul>
    </section>
  );
}
