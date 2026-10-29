"use client";

import { ArrowUUpLeftIcon, PlayIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { startSession, useCourses, useOpenSession } from "@/lib/teacher/api/hooks";
import type { Id, Lesson } from "@/lib/teacher/api/types";
import { useT } from "@/lib/teacher/i18n";
import { liveUrl } from "@/lib/teacher/routes";
import { chosenCourse, courseLabel, offeredCourses, onlyCourse, startView } from "@/lib/teacher/start";
import { Choices } from "./Choices";
import { LoadProblem } from "./LoadProblem";
import { Problem } from "./Problem";
import { Bar, Loading } from "./Skeleton";

/** What a lesson is, as far as starting it goes. A `LessonSummary` and a whole `Lesson` both fit. */
export type StartLesson = Pick<Lesson, "id" | "title" | "subject" | "year">;

/**
 * "Започни час": which class is the lesson for, and go. It is shown when the teacher presses the button and is gone when it
 * closes, so every time it opens it is a fresh question. Cancel has the focus, so that Enter on a window just opened starts
 * nothing; Start is the yellow button. A teacher who already has a lesson running is told so instead, with the way back to it,
 * whether this screen knew or only the API did (`session_open`). Close it only with its own `close()`: the browser then gives
 * the focus back to the button that opened it.
 */
export function StartDialog({ lesson, onClose }: { lesson: StartLesson; onClose: () => void }) {
  const { t, te } = useT();
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useId();
  const body = useId();
  const pick = useId();
  const open = useOpenSession();
  const courses = useCourses();
  const [picked, setPicked] = useState<Id | null>(null);
  const [asked, setAsked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<unknown>(null);

  const offered = useMemo(() => (courses.data ? offeredCourses(courses.data, lesson) : []), [courses.data, lesson]);
  const running = open.data?.session ?? null;
  const waiting = !running && (open.status === "loading" || courses.status === "loading");
  const failed = !running && !waiting && courses.status === "error";
  const view = running ? startView(true, offered) : waiting ? "waiting" : failed ? "failed" : startView(false, offered);
  const chosen = chosenCourse(offered, picked);

  // Open as a modal window the moment it is on screen, and put the focus on the safe button of whatever it shows.
  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (!d.open) d.showModal();
    d.querySelector<HTMLElement>("[data-first]")?.focus();
  }, [view]);

  const close = () => dialog.current?.close();

  const start = async () => {
    if (busy) return;
    if (!chosen) {
      // Nothing chosen: say so, and put the focus on the choices.
      setAsked(true);
      dialog.current?.querySelector<HTMLElement>("input[type=radio]")?.focus();
      return;
    }
    setBusy(true);
    setProblem(null);
    try {
      const snapshot = await startSession({ lesson_id: lesson.id, course_id: chosen.id });
      router.push(liveUrl(snapshot.session.id));
    } catch (e) {
      setProblem(e);
      setBusy(false);
    }
  };

  const titleKey =
    view === "running" ? "start.running.title" : view === "no-class" ? "start.noclass.title" : "start.title";
  const bodyText =
    view === "running" && running
      ? t("start.running.body", { title: running.lesson.title, course: courseLabel(running.subject_name, running.class_name) })
      : view === "no-class"
        ? t("start.noclass.body", { subject: lesson.subject.name })
        : view === "choose"
          ? t("start.lesson", { title: lesson.title })
          : null;

  return (
    <dialog
      ref={dialog}
      className="dialog"
      aria-labelledby={heading}
      aria-describedby={bodyText ? body : undefined}
      onClose={onClose}
    >
      <h2 id={heading} className="dialog__title">
        {t(titleKey)}
      </h2>
      {bodyText && (
        <p id={body} className="dialog__body">
          {bodyText}
        </p>
      )}

      {view === "waiting" && (
        <Loading>
          <Bar height="4rem" className="skeleton--row" />
          <Bar height="4rem" className="skeleton--row" />
        </Loading>
      )}

      {view === "failed" && <LoadProblem title={t("start.classes.failed")} error={courses.error} onRetry={courses.refetch} />}

      {view === "choose" && (
        <>
          <Choices
            name="course"
            labelledBy={heading}
            describedBy={asked && !chosen ? pick : undefined}
            value={chosen?.id ?? onlyCourse(offered)}
            onChange={(id) => {
              setPicked(id);
              setAsked(false);
            }}
            options={offered.map((c) => ({
              value: c.id,
              label: c.class.name,
              detail: c.student_count === 1 ? t("start.count.one") : t("start.count", { n: c.student_count }),
            }))}
          />
          {asked && !chosen && <Problem id={pick}>{t("start.pick")}</Problem>}
          {problem !== null && <Problem title={t("start.failed")}>{te(problem)}</Problem>}
        </>
      )}

      <div className="dialog__actions">
        {view === "choose" && (
          <button type="button" className="btn btn--primary" aria-busy={busy} disabled={busy} onClick={() => void start()}>
            <PlayIcon size={24} weight="fill" aria-hidden="true" />
            {t("start.go")}
          </button>
        )}
        {view === "running" && running && (
          <Link href={liveUrl(running.id)} prefetch={false} className="btn btn--primary" data-first>
            <ArrowUUpLeftIcon size={24} weight="bold" aria-hidden="true" />
            {t("running.back")}
          </Link>
        )}
        <button type="button" className="btn btn--secondary" data-first={view === "running" ? undefined : ""} onClick={close}>
          {view === "running" || view === "no-class" ? t("close") : t("start.cancel")}
        </button>
      </div>
    </dialog>
  );
}
