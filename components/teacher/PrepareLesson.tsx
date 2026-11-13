"use client";

import { SparkleIcon, UsersThreeIcon } from "@phosphor-icons/react";
import { useRouter, useSearchParams } from "next/navigation";
import { startTransition, useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { createSource, generateLesson, useCourses } from "@/lib/teacher/api/hooks";
import { isApiError } from "@/lib/teacher/api/errors";
import type { Id } from "@/lib/teacher/api/types";
import { EMPHASIS_MAX_CHARS } from "@/lib/teacher/lessons";
import { useT, type Key } from "@/lib/teacher/i18n";
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
  hasWork,
  materialProblemOf,
  REQUEST_LIMIT_MS,
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
import { clearRefill, readRefill, rememberForm } from "@/lib/teacher/refill";
import { backFromLesson, draftUrl, fromOf } from "@/lib/teacher/routes";
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
 * Prepare a lesson (F-03), on one page. The form has three numbered parts and one main button; pressing it checks what it
 * can on this side, reads the document if there is one (that is the wait here, with Cancel), asks for the questions, and goes on
 * to the page of the draft, which is where the questions are waited for: writing them is a job that goes on without this page
 * (BR-LES-08). Nothing typed or chosen is ever lost: Cancel, Back after a failure and a refusal of the material all return to the
 * form as it was left, and cancelling the wait for the questions fills it in again (lib/teacher/refill.ts).
 */
export function PrepareLesson() {
  const { t } = useT();
  const router = useRouter();
  const from = useSearchParams().get("from");
  const back = backFromLesson(from);
  const courses = useCourses();

  const [pickedSubject, setPickedSubject] = useState<Id | null>(null);
  const [pickedYear, setPickedYear] = useState<number | null>(null);
  const [kind, setKind] = useState<MaterialKind | null>(null);
  const [file, setFile] = useState<File | null>(null);
  // A document the API already holds, from a wait that was cancelled: shown by its name, and used again without being sent again.
  const [held, setHeld] = useState<{ name: string; size: number | null; sourceId: Id } | null>(null);
  const [text, setText] = useState("");
  const [emphasis, setEmphasis] = useState("");
  const [problems, setProblems] = useState<Problems>({});
  // What the API said, for a refusal of the material that the form has no sentence of its own for.
  const [refusal, setRefusal] = useState<unknown>(null);
  const [stage, setStage] = useState<Stage>({ name: "form" });
  const [focusOn, setFocusOn] = useState<{ key: FocusKey } | null>(null);
  // Said aloud, and only aloud, when the form comes back by itself (Cancel, "Промени го внесеното"): the focus is on its button, which
  // alone says nothing of what has happened.
  const [said, setSaid] = useState<Key | null>(null);

  // The form as a cancelled wait left it, once the subjects are known (a subject that is not offered is not chosen).
  const refilled = useRef(false);
  useEffect(() => {
    if (refilled.current || courses.status !== "ready") return;
    refilled.current = true;
    const refill = readRefill();
    if (!refill) return;
    clearRefill();
    startTransition(() => {
      setPickedSubject(refill.subject_id);
      setPickedYear(refill.year);
      setKind(refill.kind);
      setText(refill.text);
      setEmphasis(refill.emphasis);
      if (refill.document) setHeld({ name: refill.document.name, size: refill.document.size, sourceId: refill.document.source_id });
      setSaid(refill.note === "kept" ? "prepare.kept" : "prepare.cancelled");
      setFocusOn({ key: "submit" });
    });
  }, [courses.status]);

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
    setHeld(null);
    // A document that cannot be used is said so at once, where it was chosen; the page does not move the focus.
    const wrong = picked ? checkFile(picked) : null;
    setProblems((p) => ({ ...p, material: wrong ?? undefined }));
    setRefusal(null);
    if (!picked) setFocusOn({ key: "file" });
  };

  /**
   * Ask for the questions. With a `source` (a retry, or a document held from before) only the questions are asked for. Everything
   * the call needs is read here, from the form as it stands; a Cancel, a limit that runs out and a dropped connection all end it
   * through the same signal, and the reason it carries says which. The questions come back as a draft, at once, and the page of the
   * draft is where they are waited for.
   */
  const start = async (source: Id | null) => {
    if (subject === null || year === null) return;
    const mine = ++attempt.current;
    const ctl = new AbortController();
    stop.current = ctl;
    const stoppedFor = () => (ctl.signal.aborted ? (ctl.signal.reason as StopReason) : null);
    const within = async <T,>(call: () => Promise<T>, limit: number): Promise<T> => {
      const timer = setTimeout(() => ctl.abort("timeout" satisfies StopReason), limit);
      try {
        return await call();
      } finally {
        clearTimeout(timer);
      }
    };

    let have = source;
    try {
      if (have === null) {
        // A document is read first (it can take a while, BR-LES-09); typed sentences are taken at once, so that part is skipped.
        setStage({ name: "wait", phase: kind === "file" ? "reading" : "writing" });
        const input = kind === "file" && file ? ({ kind: "upload", file } as const) : ({ kind: "typed", text: text.trim() } as const);
        have = (await within(() => createSource(input, { signal: ctl.signal }), WAIT_LIMIT_MS)).source_id;
        sourceId.current = have;
      }
      setStage({ name: "wait", phase: "writing" });
      const draft = await within(() => generateLesson({ source_id: have!, subject_id: subject, year, emphasis: emphasisOf(emphasis) }, { signal: ctl.signal }), REQUEST_LIMIT_MS);
      if (mine !== attempt.current) return;
      // What was typed is not on the server: keep it for as long as the tab is open, in case the wait is cancelled.
      rememberForm({ draft_id: draft.id, text, file_size: file?.size ?? held?.size ?? null });
      // The wait is not a place to come back to: Back from the draft goes to where the teacher started.
      router.replace(draftUrl(draft.id, fromOf(from)));
    } catch (e) {
      const why = stoppedFor();
      if (mine !== attempt.current || why === "cancel" || why === "leave") return;
      // A document kept from before that the API no longer holds: the form asks for it again, with the rest kept.
      if (held && have === held.sourceId && isApiError(e) && e.code === "not_found") {
        const next: Problems = { material: "gone" };
        setHeld(null);
        setProblems(next);
        setStage({ name: "form" });
        setFocusOn({ key: "file" });
        return;
      }
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
    const chosen = file ?? (held ? { name: held.name, size: held.size ?? 1 } : null);
    const found = checkForm({ subject, year, needsYear: subject !== null, kind, file: chosen, text });
    setProblems(found);
    setRefusal(null);
    const first = firstProblem(found);
    if (first) {
      setFocusOn({ key: focusKeyOf(first, found, kind) });
      return;
    }
    // A document held from before is used again; anything else is read afresh.
    sourceId.current = kind === "file" && !file && held ? held.sourceId : null;
    setSaid(null);
    setFocusOn({ key: "wait" });
    void start(sourceId.current);
  };

  const cancel = () => {
    attempt.current++;
    stop.current?.abort("cancel" satisfies StopReason);
    setStage({ name: "form" });
    setSaid("prepare.cancelled");
    setFocusOn({ key: "submit" });
  };

  const backToForm = () => {
    setStage({ name: "form" });
    setSaid("prepare.kept");
    setFocusOn({ key: "submit" });
  };

  const retry = () => {
    setSaid(null);
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
        {/* There before it has anything to say, so that what it says is read out. */}
        <p role="status" className="sr">
          {said ? t(said) : ""}
        </p>
        {stage.name === "wait" && <Waiting phase={stage.phase} withDocument={kind === "file"} onCancel={cancel} />}
        {stage.name === "failed" && <WaitFailure failure={stage.failure} error={stage.error} onRetry={retry} onBack={backToForm} />}
        {stage.name === "form" && (
          <form className="prepare" noValidate onSubmit={submit}>
            <section className="card prepare__part" aria-labelledby="prepare-1">
              <h2 id="prepare-1">{t("prepare.part1")}</h2>
              <div className="prepare__group">
                {subjects.length === 1 ? (
                  <Stated label={t("prepare.subject")} text={subjects[0].name} />
                ) : (
                  <>
                    <h3 className="prepare__label" id="prepare-subject">
                      {t("prepare.subject")}
                    </h3>
                    <div className="prepare__tiles prepare__tiles--rows" data-focus="subject">
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
                  </>
                )}
                {problems.subject && <Problem id="prepare-subject-problem">{t("prepare.problem.subject")}</Problem>}
              </div>
              {subject !== null && (
                <div className="prepare__group">
                  {years.length === 1 ? (
                    <Stated
                      label={t("prepare.year")}
                      text={t("prepare.year.value", { n: years[0], roman: romanYear(years[0]) })}
                      detail={classesOf(courses.data ?? [], subject, years[0]).join(", ")}
                    />
                  ) : (
                    <>
                      <h3 className="prepare__label" id="prepare-year">
                        {t("prepare.year")}
                      </h3>
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
                    </>
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
              file={file ?? held}
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
        {/* Leaving the form, the wait for a document or the failure that keeps it loses what was entered, so it asks first. */}
        {hasWork({ file: file ?? held, text, emphasis }) && <LeaveGuard body="prepare.leave.form.body" />}
      </div>
    </>
  );
}

/**
 * What there is no choice about because there is only one: said as a plain line, "Предмет: Математика", and not as a chosen
 * row. A row with a tick and an edge looks like something to press; this is only something to read.
 */
function Stated({ label, text, detail }: { label: string; text: string; detail?: string }) {
  return (
    <p className="prepare__stated">
      <span className="prepare__stated-label">{label}:</span> <span className="prepare__stated-value">{text}</span>
      {detail && (
        <>
          {" "}
          <span aria-hidden="true">·</span> <span className="prepare__stated-detail">{detail}</span>
        </>
      )}
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
