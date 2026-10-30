"use client";

import { CheckCircleIcon, SparkleIcon, UsersThreeIcon } from "@phosphor-icons/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { createSource, generateLesson, useCourses } from "@/lib/teacher/api/hooks";
import type { Id } from "@/lib/teacher/api/types";
import { EMPHASIS_MAX_CHARS } from "@/lib/teacher/lessons";
import { useT } from "@/lib/teacher/i18n";
import {
  checkFile,
  checkForm,
  chosenSubject,
  chosenYear,
  classesOf,
  emphasisOf,
  failureOf,
  firstProblem,
  focusKeyOf,
  materialProblemOf,
  showsEmphasisCount,
  sourceToKeep,
  subjectsOf,
  WAIT_LIMIT_MS,
  yearsOf,
  type Failure,
  type FocusKey,
  type MaterialKind,
  type Problems,
  type StopReason,
} from "@/lib/teacher/prepare";
import { backFromLesson, draftUrl } from "@/lib/teacher/routes";
import { romanYear } from "@/lib/teacher/format";
import { Choices } from "./Choices";
import { LeaveGuard } from "./LeaveGuard";
import { LoadProblem } from "./LoadProblem";
import { MaterialPart } from "./MaterialPart";
import { PageHeader } from "./PageHeader";
import { WaitFailure, Waiting, type Phase } from "./PrepareWait";
import { Problem } from "./Problem";
import { Bar, Loading } from "./Skeleton";

type Stage = { name: "form" } | { name: "wait"; phase: Phase } | { name: "failed"; failure: Failure; error: unknown };

/**
 * Prepare a lesson (F-03), on one page. The form has three numbered parts and one yellow button; pressing it checks what it
 * can on this side, then waits right here, in two honest phases that follow the real calls (a document is read, then the
 * questions are written), and ends on the draft page. Nothing is on another route, so nothing typed or chosen is ever lost:
 * Cancel, Back after a failure and a refusal of the material all return to the form as it was left.
 */
export function PrepareLesson() {
  const { t } = useT();
  const router = useRouter();
  const back = backFromLesson(useSearchParams().get("from"));
  const courses = useCourses();

  const [pickedSubject, setPickedSubject] = useState<Id | null>(null);
  const [pickedYear, setPickedYear] = useState<number | null>(null);
  const [kind, setKind] = useState<MaterialKind | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [emphasis, setEmphasis] = useState("");
  const [problems, setProblems] = useState<Problems>({});
  // What the API said, for a refusal of the material that the form has no sentence of its own for.
  const [refusal, setRefusal] = useState<unknown>(null);
  const [stage, setStage] = useState<Stage>({ name: "form" });
  const [focusOn, setFocusOn] = useState<{ key: FocusKey } | null>(null);

  const subjects = useMemo(() => subjectsOf(courses.data ?? []), [courses.data]);
  const subject = chosenSubject(subjects, pickedSubject);
  const years = useMemo(() => yearsOf(courses.data ?? [], subject), [courses.data, subject]);
  const year = chosenYear(years, pickedYear);

  // The call in flight, and the source it made: a retry after the questions failed asks again with the same source.
  const stop = useRef<AbortController | null>(null);
  const sourceId = useRef<Id | null>(null);
  const attempt = useRef(0);
  const waiting = stage.name === "wait";

  // The focus goes where the work is: the first problem, the wait, the way forward after a failure.
  useEffect(() => {
    if (!focusOn) return;
    const el = document.querySelector<HTMLElement>(`[data-focus="${focusOn.key}"]`);
    const target = el?.matches("input, textarea, button, [tabindex]") ? el : el?.querySelector<HTMLElement>("input:checked, input, textarea, button");
    target?.focus();
  }, [focusOn]);

  // The connection dropping ends the wait at once: waiting on would only be waiting for a timeout.
  useEffect(() => {
    if (!waiting) return;
    const dropped = () => stop.current?.abort("offline" satisfies StopReason);
    window.addEventListener("offline", dropped);
    return () => window.removeEventListener("offline", dropped);
  }, [waiting]);

  // Leaving the page ends the wait: there is nothing to wait for, and nobody to show the draft to.
  useEffect(
    () => () => {
      attempt.current++;
      stop.current?.abort("leave" satisfies StopReason);
    },
    [],
  );

  const forget = (part: keyof Problems) => setProblems((p) => (p[part] === undefined ? p : { ...p, [part]: undefined }));

  const pickFile = (picked: File | null) => {
    setFile(picked);
    // A document that cannot be used is said so at once, where it was chosen; the page does not move the focus.
    const wrong = picked ? checkFile(picked) : null;
    setProblems((p) => ({ ...p, material: wrong ?? undefined }));
    setRefusal(null);
    if (!picked) setFocusOn({ key: "file" });
  };

  /**
   * Ask for the questions. With a `source` (a retry) only the questions are asked for again. Everything the call needs is
   * read here, from the form as it stands; a Cancel, a limit that runs out and a dropped connection all end it through the
   * same signal, and the reason it carries says which.
   */
  const start = async (source: Id | null) => {
    if (subject === null || year === null) return;
    const mine = ++attempt.current;
    const ctl = new AbortController();
    stop.current = ctl;
    const stoppedFor = () => (ctl.signal.aborted ? (ctl.signal.reason as StopReason) : null);
    // Each call gets the whole limit (BR-LES-09); the AI's wait is the long one.
    const within = async <T,>(call: () => Promise<T>): Promise<T> => {
      const timer = setTimeout(() => ctl.abort("timeout" satisfies StopReason), WAIT_LIMIT_MS);
      try {
        return await call();
      } finally {
        clearTimeout(timer);
      }
    };

    let have = source;
    try {
      if (have === null) {
        // A document is read first; typed sentences are taken at once, so that part of the wait is skipped.
        setStage({ name: "wait", phase: kind === "file" ? "reading" : "writing" });
        const input = kind === "file" && file ? ({ kind: "upload", file } as const) : ({ kind: "typed", text: text.trim() } as const);
        have = (await within(() => createSource(input, { signal: ctl.signal }))).source_id;
        sourceId.current = have;
      }
      setStage({ name: "wait", phase: "writing" });
      const draft = await within(() => generateLesson({ source_id: have!, subject_id: subject, year, emphasis: emphasisOf(emphasis) }, { signal: ctl.signal }));
      if (mine !== attempt.current) return;
      // The wait is not a place to come back to: Back from the draft goes to where the teacher started.
      router.replace(draftUrl(draft.id));
    } catch (e) {
      const why = stoppedFor();
      if (mine !== attempt.current || why === "cancel" || why === "leave") return;
      const refused = have === null ? materialProblemOf(e) : null;
      if (refused) {
        // The material was refused: back to part 2, with the reason in words and everything kept.
        const next: Problems = { material: refused };
        setRefusal(e);
        setProblems(next);
        setStage({ name: "form" });
        setFocusOn({ key: focusKeyOf("material", next, kind) });
        return;
      }
      sourceId.current = sourceToKeep(have, e);
      setStage({ name: "failed", failure: failureOf(e, why), error: e });
      setFocusOn({ key: "failed" });
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const found = checkForm({ subject, year, needsYear: subject !== null, kind, file, text });
    setProblems(found);
    setRefusal(null);
    const first = firstProblem(found);
    if (first) {
      setFocusOn({ key: focusKeyOf(first, found, kind) });
      return;
    }
    sourceId.current = null;
    setFocusOn({ key: "wait" });
    void start(null);
  };

  const cancel = () => {
    attempt.current++;
    stop.current?.abort("cancel" satisfies StopReason);
    setStage({ name: "form" });
    setFocusOn({ key: "submit" });
  };

  const backToForm = () => {
    setStage({ name: "form" });
    setFocusOn({ key: "submit" });
  };

  const retry = () => {
    setFocusOn({ key: "wait" });
    void start(sourceId.current);
  };

  const writeInstead = () => {
    setKind("typed");
    setProblems((p) => ({ ...p, material: undefined }));
    setFocusOn({ key: "text" });
  };

  const header = <PageHeader title={t("lessonsNew.title")} subtitle={t("prepare.sub")} back={back.href} backLabel={t(back.label)} />;

  if (courses.status === "loading") {
    return (
      <>
        {header}
        <div className="content">
          <Loading>
            <div className="card prepare__part" aria-hidden="true">
              <Bar width="14rem" height="2rem" />
              <Bar height="4rem" className="skeleton--row" />
              <Bar height="4rem" className="skeleton--row" />
            </div>
          </Loading>
        </div>
      </>
    );
  }
  if (courses.status === "error") {
    return (
      <>
        {header}
        <div className="content">
          <LoadProblem title={t("prepare.courses.failed")} error={courses.error} onRetry={courses.refetch} />
        </div>
      </>
    );
  }
  if (subjects.length === 0) {
    return (
      <>
        {header}
        <div className="content">
          <div className="card card--stack">
            <span className="card__icon">
              <UsersThreeIcon size={32} aria-hidden="true" />
            </span>
            <h2>{t("prepare.none.title")}</h2>
            <p>{t("prepare.none.body")}</p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {header}
      <div className="content">
        {stage.name === "wait" && (
          <>
            <Waiting phase={stage.phase} withDocument={kind === "file"} onCancel={cancel} />
            <LeaveGuard />
          </>
        )}
        {stage.name === "failed" && <WaitFailure failure={stage.failure} error={stage.error} onRetry={retry} onBack={backToForm} />}
        {stage.name === "form" && (
          <form className="prepare" noValidate onSubmit={submit}>
            <section className="card prepare__part" aria-labelledby="prepare-1">
              <h2 id="prepare-1">{t("prepare.part1")}</h2>
              <div className="prepare__group">
                <h3 className="prepare__label" id="prepare-subject">
                  {t("prepare.subject")}
                </h3>
                {subjects.length === 1 ? (
                  <Stated text={subjects[0].name} />
                ) : (
                  <div className="prepare__tiles" data-focus="subject">
                    <Choices
                      name="subject"
                      labelledBy="prepare-subject"
                      describedBy={problems.subject ? "prepare-subject-problem" : undefined}
                      value={subject}
                      options={subjects.map((s) => ({ value: s.id, label: s.name }))}
                      onChange={(id) => {
                        setPickedSubject(id);
                        setPickedYear(null);
                        forget("subject");
                        forget("year");
                      }}
                    />
                  </div>
                )}
                {problems.subject && <Problem id="prepare-subject-problem">{t("prepare.problem.subject")}</Problem>}
              </div>
              {subject !== null && (
                <div className="prepare__group">
                  <h3 className="prepare__label" id="prepare-year">
                    {t("prepare.year")}
                  </h3>
                  {years.length === 1 ? (
                    <Stated text={t("lesson.year", { n: years[0], roman: romanYear(years[0]) })} detail={classesOf(courses.data ?? [], subject, years[0]).join(", ")} />
                  ) : (
                    <div className="prepare__tiles" data-focus="year">
                      <Choices
                        name="year"
                        labelledBy="prepare-year"
                        describedBy={problems.year ? "prepare-year-problem" : undefined}
                        value={year === null ? null : String(year)}
                        options={years.map((y) => ({
                          value: String(y),
                          label: t("lesson.year", { n: y, roman: romanYear(y) }),
                          detail: classesOf(courses.data ?? [], subject, y).join(", "),
                        }))}
                        onChange={(value) => {
                          setPickedYear(Number(value));
                          forget("year");
                        }}
                      />
                    </div>
                  )}
                  {problems.year && <Problem id="prepare-year-problem">{t("prepare.problem.year")}</Problem>}
                </div>
              )}
            </section>

            <MaterialPart
              kind={kind}
              onKind={(next) => {
                setKind(next);
                forget("material");
              }}
              file={file}
              onFile={pickFile}
              text={text}
              onText={(next) => {
                setText(next);
                forget("material");
              }}
              problem={problems.material}
              problemError={refusal}
              onWriteInstead={writeInstead}
            />

            <EmphasisPart value={emphasis} onChange={setEmphasis} />

            <div className="prepare__go">
              <button type="submit" className="btn btn--primary btn--big" data-focus="submit">
                <SparkleIcon size={24} weight="fill" aria-hidden="true" />
                {t("prepare.go")}
              </button>
              <p>{t("prepare.go.note")}</p>
            </div>
          </form>
        )}
      </div>
    </>
  );
}

/** A choice that is already made because there was only one: said plainly, looking like a chosen row. */
function Stated({ text, detail }: { text: string; detail?: string }) {
  return (
    <p className="prepare__stated">
      <CheckCircleIcon size={28} weight="fill" aria-hidden="true" />
      <span className="choice__text">{text}</span>
      {detail && <span className="choice__detail">{detail}</span>}
    </p>
  );
}

/** Part 3: one optional line. The count shows only near the limit, and says so once at the limit; it never runs on every key. */
function EmphasisPart({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { t } = useT();
  const hint = useId();
  const count = useId();
  const near = showsEmphasisCount(value.length);
  return (
    <section className="card prepare__part" aria-labelledby="prepare-3">
      <h2 id="prepare-3">
        {t("prepare.part3")}
        <span className="tag">{t("prepare.optional")}</span>
      </h2>
      <p id={hint} className="prepare__hint">
        {t("prepare.emphasis.hint")}
      </p>
      <input
        type="text"
        className="field"
        maxLength={EMPHASIS_MAX_CHARS}
        value={value}
        aria-labelledby="prepare-3"
        aria-describedby={near ? `${hint} ${count}` : hint}
        onChange={(e) => onChange(e.target.value)}
      />
      {near && (
        <p id={count} className="prepare__count">
          {t("prepare.emphasis.count", { n: value.length })}
        </p>
      )}
      <p role="status" className="sr">
        {value.length >= EMPHASIS_MAX_CHARS ? t("prepare.emphasis.max") : ""}
      </p>
    </section>
  );
}
