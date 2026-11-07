"use client";

import { ArrowRightIcon, CaretDownIcon, CheckCircleIcon, CheckIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { notFound, useParams } from "next/navigation";
import { useRef, useState, type ReactNode } from "react";
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
import { CLASSES, liveUrl } from "@/lib/teacher/routes";
import { TODAY } from "@/lib/teacher/signin";
import { dateParts } from "@/lib/teacher/when";
import { classLine } from "./ClassesPage";
import { LoadProblem } from "./LoadProblem";
import { PageHeader } from "./PageHeader";
import { Problem } from "./Problem";
import { Bar, Loading } from "./Skeleton";

const SECTIONS = ["attendance", "points", "topics", "questions", "practice", "focus", "settings"] as const;
type Section = (typeof SECTIONS)[number];
/** The words of the links to the sections: the heading of each, but short for the two with long headings. */
const SECTION_KEY = {
  attendance: "course.s.attendance",
  points: "course.s.points",
  topics: "course.s.topics",
  questions: "course.s.questions",
  practice: "course.s.practice",
  focus: "course.jump.focus",
  settings: "course.jump.settings",
} as const satisfies Record<Section, string>;

const REASON_KEY = {
  no_phone: "live.reason.no_phone",
  battery: "live.reason.battery",
  no_data: "live.reason.no_data",
  no_focus_authorization: "live.reason.no_focus_authorization",
} as const satisfies Record<NoDeviceReason, string>;

/** A list longer than five rows shows the first five, and the rest behind one button that says how many there are in all. Closing it again brings the section back into view. */
function Limited<T>({ items, children }: { items: readonly T[]; children: (shown: readonly T[]) => ReactNode }) {
  const { t } = useT();
  const [all, setAll] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const long = items.length > SHOW_FIRST;
  const toggle = () => {
    if (all) button.current?.closest("section")?.scrollIntoView({ block: "start" });
    setAll(!all);
  };
  return (
    <>
      {children(all || !long ? items : items.slice(0, SHOW_FIRST))}
      {long && (
        <button ref={button} type="button" className="btn btn--secondary" aria-expanded={all} onClick={toggle} data-testid="show-all">
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
 * sections in the order a teacher asks: who comes, how the lessons went (each opens its end page), which topics are hard, what was asked, who did the
 * practice, who left the app, and the class's one setting. A class that is not the teacher's is the not-found page of the app.
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
        <ul className="cres__tiles" data-testid="summary">
          <li>
            <strong data-testid="sum-lessons">{summary.lessons}</strong>
            <span>{t(isOne(summary.lessons, locale) ? "course.sum.lessons.one" : "course.sum.lessons")}</span>
          </li>
          <li>
            <strong data-testid="sum-attendance">{summary.attendance === null ? "–" : `${percent(summary.attendance)}%`}</strong>
            <span>{t("course.sum.attendance")}</span>
          </li>
          <li>
            <strong data-testid="sum-right">{summary.right === null ? "–" : `${percent(summary.right)}%`}</strong>
            <span>{t("course.sum.right")}</span>
          </li>
        </ul>
        <p data-testid="sum-weakest">
          <strong>{t("course.sum.weakest")}:</strong>{" "}
          {weakest ? t("course.sum.weakest.line", { topic: weakest.topic, right: weakest.right, total: weakest.total }) : t("course.sum.weakest.none")}
        </p>
        <nav aria-label={t("course.jump")} className="cres__jump">
          <span>{t("course.jump.lead")}:</span>
          <ul>
            {SECTIONS.map((s) => (
              <li key={s}>
                <a href={`#${s}`}>{t(SECTION_KEY[s])}</a>
              </li>
            ))}
          </ul>
        </nav>
      </section>
      <AttendanceSection d={d} locale={locale} />
      <PointsSection d={d} />
      <TopicsSection d={d} />
      <QuestionsSection d={d} />
      <PracticeSection d={d} />
      <FocusSection d={d} />
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
              <caption className="sr">{t("course.att.caption")}</caption>
              <thead>
                <tr>
                  <th scope="col">{t("course.att.col.name")}</th>
                  <th scope="col">{t("course.att.col.present")}</th>
                  <th scope="col">{t("course.att.col.late")}</th>
                  <th scope="col">{t("course.att.col.absent")}</th>
                  <th scope="col">{t("course.att.col.nodevice")}</th>
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
                        <span className="cres__name">{registerName(r.full_name, locale)}</span>
                        {r.joined_mid_year && r.joined_class_at && (
                          <span className="cres__note" data-testid="joined-note">
                            {t("course.att.joined", { date: date(Date.parse(r.joined_class_at)) })}
                          </span>
                        )}
                      </th>
                      {r.held === 0 ? (
                        <td colSpan={4}>{t("course.att.none")}</td>
                      ) : (
                        <>
                          <td data-label={t("course.att.col.present")}>{r.present}</td>
                          <td data-label={t("course.att.col.late")}>{r.late}</td>
                          <td data-label={t("course.att.col.absent")}>{r.absent}</td>
                          <td data-label={t("course.att.col.nodevice")}>
                            {r.no_device}
                            {reasons && (
                              <span className="cres__note" data-testid="reasons">
                                {reasons}
                              </span>
                            )}
                          </td>
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
              <caption className="sr">{t("course.pts.caption")}</caption>
              <thead>
                <tr>
                  <th scope="col">{t("course.pts.col.date")}</th>
                  <th scope="col">{t("course.pts.col.lesson")}</th>
                  <th scope="col">{t("course.pts.col.took")}</th>
                  <th scope="col">{t("course.pts.col.right")}</th>
                  <th scope="col">
                    <span className="sr">{t("course.pts.col.open")}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.session.id} data-testid="points-row">
                    <th scope="row">{date(Date.parse(r.session.started_at))}</th>
                    <td className="cres__title">{r.session.lesson.title}</td>
                    <td data-label={t("course.pts.col.took")}>{t("course.pts.took", { n: r.took_part, total: r.enrolled })}</td>
                    <td data-label={t("course.pts.col.right")}>{r.session.question_count === 0 ? t("course.pts.noquestions") : <strong>{t("course.pts.right", { n: r.right })}</strong>}</td>
                    <td className="cres__open">
                      <Link href={liveUrl(r.session.id)} prefetch={false} className="cres__link" aria-label={`${t("course.pts.open")}: ${r.session.lesson.title}, ${date(Date.parse(r.session.started_at))}`}>
                        {t("course.pts.open")}
                        <ArrowRightIcon size={20} aria-hidden="true" />
                      </Link>
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
                    <div className="cres__topic-share">
                      <span className="cres__bar" aria-hidden="true">
                        <span style={{ width: `${percent(share)}%` }} />
                      </span>
                      <p>{t("course.topics.row", { right: x.right, total: x.total, percent: percent(share) })}</p>
                    </div>
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
            {t("course.focus.total", { times: timesWord(times), people: t(isOne(rows.length, locale) ? "classes.students.one" : "classes.students", { n: rows.length }) })}
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
                  <p className="cres__meta">
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
                  <p>
                    {t("course.pr.row", { done: practice.completed, total: practice.students })}
                    {" · "}
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
      <summary>
        {t("course.pr.who")}
        <CaretDownIcon size={24} weight="bold" aria-hidden="true" />
      </summary>
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

/**
 * The one setting the teacher owns for a class: the bonus for a fast answer (BR-PTS-04, `PATCH /courses/{id}`). One switch, its state said in words
 * beside it; it saves the moment it is pressed and says so. Quiet, last on the page.
 */
function Settings({ d }: { d: CourseDashboard }) {
  const { t, te } = useT();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [saved, setSaved] = useState<boolean | null>(null);
  // What was just saved shows at once; it gives way as soon as the course read from the server says something else.
  const [local, setLocal] = useState<{ value: boolean; from: boolean } | null>(null);
  const fromServer = d.course.speed_bonus_on;
  const on = local && local.from === fromServer ? local.value : fromServer;
  const flip = async () => {
    if (busy) return;
    setBusy(true);
    setProblem(null);
    setSaved(null);
    try {
      await updateCourse(d.course.id, { speed_bonus_on: !on });
      setLocal({ value: !on, from: fromServer });
      setSaved(!on);
    } catch (e) {
      setProblem(te(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="card cres__sec" id="settings" aria-labelledby="h-settings" tabIndex={-1}>
      <h2 id="h-settings">{t("course.s.settings")}</h2>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-labelledby="speed-name"
        aria-describedby="speed-body"
        aria-busy={busy}
        className="cres__switch"
        onClick={() => void flip()}
        data-testid="speed-switch"
      >
        <span id="speed-name" className="cres__switch-name">
          {t("course.set.speed")}
        </span>
        <span className="cres__switch-state" aria-hidden="true">
          <strong>{on ? t("course.set.speed.on") : t("course.set.speed.off")}</strong>
          <span className="cres__track" data-on={on}>
            <span className="cres__thumb">{on && <CheckIcon size={20} weight="bold" />}</span>
          </span>
        </span>
      </button>
      <p id="speed-body">{t("course.set.speed.body")}</p>
      <p role="status" className="cres__saved" data-testid="speed-saved">
        {saved !== null && (
          <>
            <CheckCircleIcon size={28} weight="fill" aria-hidden="true" />
            {t(saved ? "course.set.saved.on" : "course.set.saved.off")}
          </>
        )}
      </p>
      {problem && <Problem title={t("course.set.failed")}>{problem}</Problem>}
    </section>
  );
}
