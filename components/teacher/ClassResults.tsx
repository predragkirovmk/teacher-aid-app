"use client";

import { ArrowRightIcon, CheckCircleIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { notFound, useParams } from "next/navigation";
import { useState, type ReactNode } from "react";
import { updateCourse, useDashboard, usePracticeResults } from "@/lib/teacher/api/hooks";
import { isApiError } from "@/lib/teacher/api/errors";
import type { CourseDashboard, NoDeviceReason } from "@/lib/teacher/api/types";
import { registerName, sortAttendance } from "@/lib/teacher/attendance";
import {
  attendanceByStudent,
  focusByStudent,
  lessonRows,
  lessonsWithoutPractice,
  newestQuestions,
  percent,
  practiceRows,
  SHOW_FIRST,
  summaryOf,
  topicShare,
  weakestFirst,
} from "@/lib/teacher/classes";
import { decimal, isOne } from "@/lib/teacher/format";
import { useT } from "@/lib/teacher/i18n";
import { CLASSES } from "@/lib/teacher/routes";
import { TODAY } from "@/lib/teacher/signin";
import { liveUrl } from "@/lib/teacher/routes";
import { dateParts } from "@/lib/teacher/when";
import { classLine } from "./ClassesPage";
import { LoadProblem } from "./LoadProblem";
import { PageHeader } from "./PageHeader";
import { Problem } from "./Problem";
import { Bar, Loading } from "./Skeleton";

const SECTIONS = ["attendance", "points", "topics", "focus", "questions", "practice", "history", "settings"] as const;
type Section = (typeof SECTIONS)[number];
const SECTION_KEY = {
  attendance: "course.s.attendance",
  points: "course.s.points",
  topics: "course.s.topics",
  focus: "course.s.focus",
  questions: "course.s.questions",
  practice: "course.s.practice",
  history: "course.s.history",
  settings: "course.s.settings",
} as const satisfies Record<Section, string>;

const REASON_KEY = {
  no_phone: "live.reason.no_phone",
  battery: "live.reason.battery",
  no_data: "live.reason.no_data",
  no_focus_authorization: "live.reason.no_focus_authorization",
} as const satisfies Record<NoDeviceReason, string>;

/** A list longer than ten rows shows the first ten, and the rest behind one button that says how many there are in all. */
function Limited<T>({ items, children }: { items: readonly T[]; children: (shown: readonly T[]) => ReactNode }) {
  const { t } = useT();
  const [all, setAll] = useState(false);
  const long = items.length > SHOW_FIRST;
  return (
    <>
      {children(all || !long ? items : items.slice(0, SHOW_FIRST))}
      {long && (
        <button type="button" className="btn btn--secondary" aria-expanded={all} onClick={() => setAll(!all)} data-testid="show-all">
          {all ? t("course.less") : t("course.more", { n: items.length })}
        </button>
      )}
    </>
  );
}

function useDate() {
  const { t } = useT();
  return (ms: number) => {
    const d = dateParts(ms);
    return `${d.day} ${t(d.month)}`;
  };
}

/**
 * The results of one class (FR-DASH-01, FR-DASH-05), from the one call that holds the whole season: a short summary and links to the sections, then the
 * sections in the order a teacher asks: who comes, how the lessons went, which topics are hard, who left the app, what was asked, who did the practice,
 * which lessons were held, and the class's one setting. A class that is not the teacher's is the not-found page of the app.
 */
export function ClassResults() {
  const { t, locale } = useT();
  const { courseId } = useParams<{ courseId: string }>();
  const dash = useDashboard(courseId);
  const d = dash.data;
  if (dash.status === "error" && isApiError(dash.error) && dash.error.code === "not_found") notFound();

  return (
    <>
      <PageHeader
        title={d ? classLine(d.course.class.name, d.course.subject.name) : t("course.title.loading")}
        subtitle={d ? t(isOne(d.course.student_count, locale) ? "classes.students.one" : "classes.students", { n: d.course.student_count }) : undefined}
        back={CLASSES}
        backLabel={t("back.classes")}
      />
      <div className="content cres">
        {dash.status === "loading" && (
          <Loading>
            <div className="card card--stack" aria-hidden="true">
              <Bar width="30%" height="2rem" />
              <Bar height="5rem" className="skeleton--row" />
            </div>
            <div className="card card--stack" aria-hidden="true">
              <Bar width="40%" height="2rem" />
              <Bar height="3.5rem" className="skeleton--row" />
              <Bar height="3.5rem" className="skeleton--row" />
              <Bar height="3.5rem" className="skeleton--row" />
            </div>
          </Loading>
        )}
        {dash.status === "error" && <LoadProblem title={t("course.error.title")} error={dash.error} onRetry={dash.refetch} />}
        {d && (d.sessions.length === 0 ? <NoLessons d={d} /> : <Season d={d} />)}
      </div>
    </>
  );
}

function NoLessons({ d }: { d: CourseDashboard }) {
  const { t } = useT();
  return (
    <>
      <section className="card card--stack" aria-labelledby="empty-title" data-testid="course-empty">
        <h2 id="empty-title">{t("course.empty.title")}</h2>
        <p>{t("course.empty.body")}</p>
        <Link href={TODAY} className="btn btn--primary">
          {t("course.empty.cta")}
          <ArrowRightIcon size={24} weight="bold" aria-hidden="true" />
        </Link>
      </section>
      <Settings d={d} />
    </>
  );
}

function Season({ d }: { d: CourseDashboard }) {
  const { t, locale } = useT();
  const summary = summaryOf(d);
  const weakest = summary.weakest;
  return (
    <>
      <section className="card cres__sum" aria-labelledby="sum-title">
        <h2 id="sum-title">{t("course.s.summary")}</h2>
        <ul className="att__counts" data-testid="summary">
          <li>
            <strong data-testid="sum-lessons">{summary.lessons}</strong>
            <span>{t("course.sum.lessons")}</span>
          </li>
          <li>
            <strong data-testid="sum-attendance">{summary.attendance === null ? "–" : `${percent(summary.attendance)}%`}</strong>
            <span>{t("course.sum.attendance")}</span>
          </li>
        </ul>
        <p data-testid="sum-weakest">
          <strong>{t("course.sum.weakest")}:</strong>{" "}
          {weakest ? t("course.sum.weakest.line", { topic: weakest.topic, right: weakest.right, total: weakest.total }) : t("course.sum.weakest.none")}
        </p>
        <nav aria-label={t("course.jump")} className="cres__jump">
          <p className="cres__jump-title">{t("course.jump")}</p>
          <ul>
            {SECTIONS.map((s) => (
              <li key={s}>
                <a href={`#${s}`} className="btn btn--quiet">
                  {t(SECTION_KEY[s])}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </section>
      <AttendanceSection d={d} locale={locale} />
      <PointsSection d={d} />
      <TopicsSection d={d} />
      <FocusSection d={d} />
      <QuestionsSection d={d} />
      <PracticeSection d={d} />
      <HistorySection d={d} />
      <Settings d={d} />
    </>
  );
}

function AttendanceSection({ d, locale }: { d: CourseDashboard; locale: "mk" | "en" }) {
  const { t } = useT();
  const date = useDate();
  const rows = attendanceByStudent(d);
  return (
    <section className="card cres__sec" id="attendance" aria-labelledby="h-attendance" tabIndex={-1}>
      <h2 id="h-attendance">{t("course.s.attendance")}</h2>
      <p>{t("course.att.hint")}</p>
      <Limited items={rows}>
        {(shown) => (
          <div className="cres__scroll">
            <table className="att__table cres__table" data-testid="attendance-table">
              <thead>
                <tr>
                  <th scope="col">{t("course.att.col.name")}</th>
                  <th scope="col">{t("course.att.col.present")}</th>
                  <th scope="col">{t("course.att.col.late")}</th>
                  <th scope="col">{t("course.att.col.absent")}</th>
                  <th scope="col">{t("course.att.col.nodevice")}</th>
                  <th scope="col">{t("course.att.col.held")}</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => {
                  const reasons = (Object.keys(REASON_KEY) as NoDeviceReason[])
                    .filter((k) => r.reasons[k])
                    .map((k) => `${t(REASON_KEY[k])}: ${r.reasons[k]}`)
                    .join(", ");
                  return (
                    <tr key={r.student_id} data-testid="course-att-row">
                      <th scope="row">
                        {registerName(r.full_name, locale)}
                        {r.joined_mid_year && r.joined_class_at && (
                          <span className="cres__note" data-testid="joined-note">
                            {t("course.att.joined", { date: date(Date.parse(r.joined_class_at)) })}
                          </span>
                        )}
                      </th>
                      {r.held === 0 ? (
                        <td colSpan={5}>{t("course.att.none")}</td>
                      ) : (
                        <>
                          <td>{r.present}</td>
                          <td>{r.late}</td>
                          <td>{r.absent}</td>
                          <td>
                            {r.no_device}
                            {reasons && (
                              <span className="cres__note" data-testid="reasons">
                                {reasons}
                              </span>
                            )}
                          </td>
                          <td>{r.held}</td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Limited>
    </section>
  );
}

function PointsSection({ d }: { d: CourseDashboard }) {
  const { t } = useT();
  const date = useDate();
  const rows = lessonRows(d.sessions);
  return (
    <section className="card cres__sec" id="points" aria-labelledby="h-points" tabIndex={-1}>
      <h2 id="h-points">{t("course.s.points")}</h2>
      <p>{t("course.pts.hint")}</p>
      <Limited items={rows}>
        {(shown) => (
          <div className="cres__scroll">
            <table className="att__table cres__table" data-testid="points-table">
              <thead>
                <tr>
                  <th scope="col">{t("course.pts.col.date")}</th>
                  <th scope="col">{t("course.pts.col.lesson")}</th>
                  <th scope="col">{t("course.pts.col.took")}</th>
                  <th scope="col">{t("course.pts.col.right")}</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.session.id} data-testid="points-row">
                    <th scope="row">{date(Date.parse(r.session.started_at))}</th>
                    <td>{r.session.lesson.title}</td>
                    <td>{t("course.pts.took", { n: r.took_part, total: r.enrolled })}</td>
                    <td>
                      {r.session.question_count === 0 ? (
                        t("course.pts.noquestions")
                      ) : (
                        <>
                          <strong>{t("course.pts.right", { n: r.right })}</strong>
                          <span className="cres__note">{t(`course.band.${r.band}`)}</span>
                          <span className="cres__note">{t("course.pts.answered", { n: r.answered })}</span>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Limited>
    </section>
  );
}

function TopicsSection({ d }: { d: CourseDashboard }) {
  const { t } = useT();
  const topics = weakestFirst(d.topics);
  return (
    <section className="card cres__sec" id="topics" aria-labelledby="h-topics" tabIndex={-1}>
      <h2 id="h-topics">{t("course.s.topics")}</h2>
      <p>{t("course.topics.hint")}</p>
      {topics.length === 0 ? (
        <p>{t("course.topics.none")}</p>
      ) : (
        <Limited items={topics}>
          {(shown) => (
            <ol className="cres__topics" data-testid="topics-list">
              {shown.map((x, i) => {
                const share = topicShare(x) as number;
                return (
                  <li key={x.topic} data-testid="topic-row">
                    <p className="cres__topic-name">
                      <strong>{x.topic}</strong>
                      {i === 0 && <span className="cres__tag">{t("course.topics.hardest")}</span>}
                    </p>
                    <p>{t("course.topics.row", { right: x.right, total: x.total, percent: percent(share) })}</p>
                    <span className="cres__bar" aria-hidden="true">
                      <span style={{ width: `${percent(share)}%` }} />
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
        </Limited>
      )}
    </section>
  );
}

function FocusSection({ d }: { d: CourseDashboard }) {
  const { t, locale } = useT();
  const rows = focusByStudent(d);
  const times = rows.reduce((n, r) => n + r.times, 0);
  const away = (s: number) => (s < 60 ? t("course.focus.away.s", { n: s }) : t("course.focus.away.m", { n: Math.max(1, Math.round(s / 60)) }));
  const timesWord = (n: number) => t(isOne(n, locale) ? "lesson.times.one" : "lesson.times.many", { n });
  return (
    <section className="card cres__sec" id="focus" aria-labelledby="h-focus" tabIndex={-1}>
      <h2 id="h-focus">{t("course.s.focus")}</h2>
      <p>{t("course.focus.hint")}</p>
      {rows.length === 0 ? (
        <p data-testid="focus-none">{t("course.focus.none")}</p>
      ) : (
        <>
          <p data-testid="focus-total">
            <strong>{t("course.focus.total", { times, people: rows.length })}</strong>
          </p>
          <Limited items={rows}>
            {(shown) => (
              <ul className="practice__list cres__list" data-testid="focus-list">
                {shown.map((r) => (
                  <li key={r.student_id} data-testid="focus-row">
                    <span>
                      {registerName(r.full_name, locale)}
                      <span className="cres__note">
                        {t(r.lessons === 1 ? "course.focus.row.lessons.one" : "course.focus.row.lessons", { n: r.lessons })}
                        {r.away_seconds > 0 ? `, ${away(r.away_seconds)}` : ""}
                      </span>
                    </span>
                    <span>{timesWord(r.times)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Limited>
        </>
      )}
    </section>
  );
}

function QuestionsSection({ d }: { d: CourseDashboard }) {
  const { t, locale } = useT();
  const date = useDate();
  const list = newestQuestions(d.anon_questions);
  const lessons = new Map(d.sessions.map((s) => [s.id, s.lesson.title]));
  return (
    <section className="card cres__sec" id="questions" aria-labelledby="h-questions" tabIndex={-1}>
      <h2 id="h-questions">{t("course.s.questions")}</h2>
      <p>{t("course.q.hint")}</p>
      {list.length === 0 ? (
        <p data-testid="questions-none">{t("course.q.none")}</p>
      ) : (
        <Limited items={list}>
          {(shown) => (
            <ul className="cres__asked" data-testid="questions-list">
              {shown.map((q) => (
                <li key={q.id} data-testid="question-item">
                  <p className="cres__asked-text">{q.text}</p>
                  <p className="cres__note">
                    {t("course.q.meta", { name: registerName(q.sender.name, locale), lesson: lessons.get(q.session_id) ?? "", date: date(Date.parse(q.created_at)) })}
                    {q.answered_at ? ` · ${t("course.q.answered")}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Limited>
      )}
    </section>
  );
}

function PracticeSection({ d }: { d: CourseDashboard }) {
  const { t } = useT();
  const date = useDate();
  const rows = practiceRows(d);
  const without = lessonsWithoutPractice(d);
  return (
    <section className="card cres__sec" id="practice" aria-labelledby="h-practice" tabIndex={-1}>
      <h2 id="h-practice">{t("course.s.practice")}</h2>
      <p>{t("course.pr.hint")}</p>
      {rows.length === 0 ? (
        <p data-testid="practice-none-yet">{t("course.pr.none")}</p>
      ) : (
        <Limited items={rows}>
          {(shown) => (
            <ul className="cres__sets" data-testid="practice-list">
              {shown.map(({ practice, session }) => (
                <li key={practice.practice_set.id} data-testid="practice-set">
                  <h3>{session ? `${session.lesson.title}, ${date(Date.parse(session.started_at))}` : ""}</h3>
                  <p>{t("course.pr.row", { done: practice.completed, total: practice.students })}</p>
                  <p>
                    {practice.average_score === null
                      ? t("course.pr.avg.none")
                      : t("course.pr.avg", { score: decimal(String(practice.average_score), "mk"), n: practice.practice_set.question_count })}
                  </p>
                  <PracticeWho sessionId={practice.practice_set.session_id} questions={practice.practice_set.question_count} />
                </li>
              ))}
            </ul>
          )}
        </Limited>
      )}
      {rows.length > 0 && without > 0 && <p>{t("course.pr.without", { n: without, m: d.sessions.length })}</p>}
    </section>
  );
}

/** The students who did one set, behind a disclosure; the list is asked for only when it is opened. */
function PracticeWho({ sessionId, questions }: { sessionId: string; questions: number }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  return (
    <details className="cres__who" onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>{t("course.pr.who")}</summary>
      {open && <PracticeWhoList sessionId={sessionId} questions={questions} />}
    </details>
  );
}

function PracticeWhoList({ sessionId, questions }: { sessionId: string; questions: number }) {
  const { t, locale } = useT();
  const results = usePracticeResults(sessionId);
  if (results.status === "loading") return <Bar height="3.5rem" className="skeleton--row" />;
  if (results.status === "error") return <LoadProblem title={t("course.pr.who.failed")} error={results.error} onRetry={results.refetch} />;
  const done = sortAttendance((results.data?.students ?? []).filter((s) => s.completed_at !== null));
  if (done.length === 0) return <p>{t("course.pr.who.none")}</p>;
  return (
    <ul className="practice__list cres__list" data-testid="practice-students">
      {done.map((s) => (
        <li key={s.student_id}>
          <span>{registerName(s.full_name, locale)}</span>
          <span>{t("pr.done.score", { score: s.score ?? 0, total: questions })}</span>
        </li>
      ))}
    </ul>
  );
}

function HistorySection({ d }: { d: CourseDashboard }) {
  const { t } = useT();
  const date = useDate();
  return (
    <section className="card cres__sec" id="history" aria-labelledby="h-history" tabIndex={-1}>
      <h2 id="h-history">{t("course.s.history")}</h2>
      <p>{t("course.hist.hint")}</p>
      <Limited items={d.sessions}>
        {(shown) => (
          <ul className="cres__history" data-testid="history-list">
            {shown.map((s) => {
              const id = `hist-${s.id}`;
              return (
                <li key={s.id} data-testid="history-row">
                  <div>
                    <h3 id={id}>{s.lesson.title}</h3>
                    <p>{t("course.hist.meta", { date: date(Date.parse(s.started_at)), n: s.question_count })}</p>
                  </div>
                  <Link href={liveUrl(s.id)} prefetch={false} className="btn btn--secondary" aria-describedby={id}>
                    {t("course.hist.open")}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Limited>
    </section>
  );
}

/** The one setting the teacher owns for a class: the bonus for a fast answer (BR-PTS-04, `PATCH /courses/{id}`). Quiet, last on the page. */
function Settings({ d }: { d: CourseDashboard }) {
  const { t, te } = useT();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const on = d.course.speed_bonus_on;
  const flip = async () => {
    if (busy) return;
    setBusy(true);
    setProblem(null);
    try {
      await updateCourse(d.course.id, { speed_bonus_on: !on });
    } catch (e) {
      setProblem(te(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="card cres__sec" id="settings" aria-labelledby="h-settings" tabIndex={-1}>
      <h2 id="h-settings">{t("course.s.settings")}</h2>
      <h3 className="cres__setting">{t("course.set.speed")}</h3>
      <p>{t("course.set.speed.body")}</p>
      <p data-testid="speed-state" className="cres__state">
        <CheckCircleIcon size={28} weight={on ? "fill" : "regular"} aria-hidden="true" />
        <strong>{on ? t("course.set.speed.on") : t("course.set.speed.off")}</strong>
      </p>
      <div>
        <button type="button" className="btn btn--secondary" aria-busy={busy} aria-disabled={busy} onClick={() => void flip()}>
          {on ? t("course.set.speed.switch.off") : t("course.set.speed.switch.on")}
        </button>
      </div>
      {problem && <Problem title={t("course.set.failed")}>{problem}</Problem>}
    </section>
  );
}
