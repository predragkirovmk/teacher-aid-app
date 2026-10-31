"use client";

import {
  ArrowArcLeftIcon,
  CheckCircleIcon,
  CircleNotchIcon,
  FloppyDiskIcon,
  InfoIcon,
  LightningIcon,
  PencilSimpleIcon,
  PlusIcon,
  SmileyIcon,
  TimerIcon,
  WarningIcon,
  ArrowsClockwiseIcon,
} from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { Fragment, startTransition, useEffect, useReducer, useRef, useState, type ReactNode } from "react";
import { deleteDraft, refineDraft, saveLesson, setFirstRunDone, updateDraft, updateLesson, useMe } from "@/lib/teacher/api/hooks";
import type { QuestionKind, ReadyDraft, Refinement } from "@/lib/teacher/api/types";
import { announce, createAutosaver, losesWorkOnLeaving, type Autosaver, type SaveStatus, type Spoken } from "@/lib/teacher/autosave";
import {
  canAdd,
  canDelete,
  canRefine,
  contentOf,
  contentProblems,
  editedSince,
  KINDS,
  lessonOf,
  newQuestionId,
  questionProblems,
  REFINEMENTS,
  type DraftContent,
  type Problem,
} from "@/lib/teacher/editor";
import { hasUnfinishedNumber, initialState, isEmptyPatch, patchOf, reduce } from "@/lib/teacher/editor-state";
import { leaveGuideUnsaved } from "@/lib/teacher/first-run";
import { useT } from "@/lib/teacher/i18n";
import { DRAFT_RETENTION_DAYS } from "@/lib/teacher/lessons";
import { backFromLesson, draftUrl, FROM_TODAY, fromOf, lessonUrl, savedLessonUrl } from "@/lib/teacher/routes";
import { QUESTIONS_MAX } from "@/lib/teacher/scoring";
import { ConfirmDialog } from "./ConfirmDialog";
import { kindLine } from "./LessonCard";
import { QuestionCard } from "./LessonView";
import { LeaveGuard } from "./LeaveGuard";
import { PageHeader } from "./PageHeader";
import { Problem as ProblemBox } from "./Problem";
import { focusField, QuestionEditor, type FocusRequest } from "./QuestionEditor";
import { problemWords } from "./problemWords";

const REFINE_ICONS: Record<Refinement, typeof SmileyIcon> = {
  easier: SmileyIcon,
  harder: LightningIcon,
  more_questions: PlusIcon,
  shorter_timers: TimerIcon,
};

/** Where the save status is told: the visible line, with a mark that is more than colour. Said aloud only when it matters (see `announce`). */
function SaveState({ status }: { status: SaveStatus }) {
  const { t } = useT();
  const words = status === "idle" ? "editor.status.idle" : status === "saved" ? "editor.status.saved" : status === "failed" ? "editor.status.failed" : "editor.status.saving";
  return (
    <p className="savestate" data-status={status}>
      {status === "failed" ? (
        <span className="problem__badge savestate__badge" aria-hidden="true">
          <WarningIcon size={20} weight="bold" />
        </span>
      ) : status === "saved" ? (
        <CheckCircleIcon size={28} weight="fill" aria-hidden="true" />
      ) : status === "idle" ? (
        <InfoIcon size={28} aria-hidden="true" />
      ) : (
        <CircleNotchIcon size={28} aria-hidden="true" />
      )}
      <span>{t(words)}</span>
    </p>
  );
}

/**
 * The page of a draft that is ready: the lesson to read and change. The title, each question (one open at a time), the four
 * refinements, the review summary and the one yellow button that makes it a lesson. Every change goes into the draft a moment after
 * the teacher stops (lib/teacher/autosave.ts), so there is nothing to remember to save, nothing is lost by leaving, and the page
 * says so calmly. Questions are first and the summary after them, as the draft was read before it could be edited.
 */
export function Editor({ draft, from, fresh }: { draft: ReadyDraft; from: string | null; fresh: boolean }) {
  const { t } = useT();
  const router = useRouter();
  const me = useMe().data;
  const firstRun = me?.first_run_done === false;
  const [state, dispatch] = useReducer(reduce, draft, initialState);
  const { content, raw, open, removed, adding } = state;
  const questions = content.questions;

  const [status, setStatus] = useState<SaveStatus>("idle");
  const [say, setSay] = useState("");
  const [focus, setFocus] = useState<FocusRequest>(null);
  const nonce = useRef(0);
  const [checking, setChecking] = useState<string | null>(null);
  const [showProblems, setShowProblems] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<unknown>(null);
  const [unsent, setUnsent] = useState(false);
  const [refining, setRefining] = useState<Refinement | null>(null);
  const [refineError, setRefineError] = useState<unknown>(null);
  const [askingUndo, setAskingUndo] = useState(false);
  const [undoError, setUndoError] = useState<unknown>(null);
  const [undone, setUndone] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  const ask = (id: string, field: NonNullable<FocusRequest>["field"], anchor?: number) => setFocus({ id, field, nonce: ++nonce.current, anchor });
  const tell = (text: string) => setSay(text);

  // ---- The draft keeps every change -------------------------------------------------------------------------
  const saver = useRef<Autosaver<DraftContent> | null>(null);
  const sent = useRef<DraftContent>(contentOf(draft));
  const start = useRef(content);

  useEffect(() => {
    const engine = createAutosaver<DraftContent>({
      save: async (now) => {
        const patch = patchOf(sent.current, now);
        if (isEmptyPatch(patch)) return;
        await updateDraft(draft.id, patch);
        sent.current = now;
      },
      onStatus: setStatus,
    });
    saver.current = engine;
    // A page that is closing, or a connection that is back, sends what is waiting.
    const push = () => void engine.flush();
    window.addEventListener("pagehide", push);
    window.addEventListener("online", push);
    return () => {
      window.removeEventListener("pagehide", push);
      window.removeEventListener("online", push);
      // Going to another page sends what is waiting; nothing asks (unless it could not be sent, which the guard below asks about).
      void engine.flush();
      engine.dispose();
      saver.current = null;
    };
  }, [draft.id]);

  useEffect(() => {
    if (content !== start.current) saver.current?.edit(content);
  }, [content]);

  // What a screen reader is told about saving: once that it is saved, and when it is not, never for every key.
  const spoken = useRef<Spoken>(null);
  useEffect(() => {
    const out = announce(spoken.current, status);
    spoken.current = out.spoken;
    if (out.say) setSay(t(out.say === "saved" ? "editor.status.saved" : "editor.status.failed"));
  }, [status, t]);

  // ---- Arriving ---------------------------------------------------------------------------------------------
  const last = draft.refinements[draft.refinements.length - 1] ?? null;
  const refined = draft.previous_draft_id !== null && last !== null;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const wasUndone = params.get("undone") === "1";
    if (wasUndone) {
      params.delete("undone");
      const rest = params.toString();
      window.history.replaceState(window.history.state, "", `${window.location.pathname}${rest ? `?${rest}` : ""}`);
    }
    // A wait that has just ended, or a refinement undone, is said aloud; the focus goes to the first thing to change after a wait.
    startTransition(() => {
      if (wasUndone) {
        setUndone(true);
        setSay(t("refined.undone"));
        // The button that was pressed is gone with the page it was on: the focus goes where it goes after a wait.
        ask("", "title");
      } else if (fresh) {
        setSay(refined && last ? t(`refined.${last}`) : t("draft.ready"));
        ask("", "title");
      }
    });
    // Once, on arriving.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The focus requests the page itself answers: the title, the buttons that open a question and bring one back.
  useEffect(() => {
    if (!focus || !root.current) return;
    if (focus.field === "title" || focus.field === "add" || focus.field === "undo") focusField(root.current, focus.field);
    else if (focus.field === "edit") {
      const card = document.getElementById(`q-${focus.id}`);
      if (card) focusField(card, "edit");
    }
  }, [focus]);

  // ---- The questions ----------------------------------------------------------------------------------------
  const indexOf = (id: string) => questions.findIndex((q) => q.id === id);

  const finish = (id: string) => {
    const i = indexOf(id);
    const found = questionProblems(questions[i], i + 1, raw[id]);
    if (found.length > 0) {
      setChecking(id);
      ask(id, found[0].field);
      return;
    }
    setChecking(null);
    dispatch({ type: "close" });
    ask(id, "edit");
  };

  const openQuestion = (id: string) => {
    // One at a time, and the one that is open is checked first: a question that is not ready stays open and says what is missing.
    if (open && open !== id) {
      const i = indexOf(open);
      const found = questionProblems(questions[i], i + 1, raw[open]);
      if (found.length > 0) {
        setChecking(open);
        ask(open, found[0].field);
        return;
      }
    }
    setChecking(null);
    dispatch({ type: "open", id });
    ask(id, "prompt");
  };

  const move = (id: string, direction: "up" | "down", anchor: number) => {
    const i = indexOf(id);
    dispatch({ type: "move", id, direction });
    tell(t("edit.moved", { n: direction === "up" ? i : i + 2, total: questions.length }));
    ask(id, direction, anchor);
  };

  const remove = (id: string) => {
    const i = indexOf(id);
    dispatch({ type: "delete", id });
    setChecking(null);
    tell(t("edit.deleted", { n: i + 1 }));
    ask("", "undo");
  };

  const restore = () => {
    if (!removed) return;
    dispatch({ type: "restore" });
    tell(t("edit.restored"));
    ask(removed.question.id, "prompt");
  };

  const add = (kind: QuestionKind) => {
    const id = newQuestionId(draft.id);
    dispatch({ type: "add", kind, id });
    ask(id, "prompt");
  };

  // ---- Changing all of them, and going back -----------------------------------------------------------------
  const refine = async (refinement: Refinement) => {
    if (refining) return;
    setRefining(refinement);
    setRefineError(null);
    try {
      // The new draft is made from the draft as the teacher has it now, so what they changed goes with it.
      if ((await saver.current?.flush()) === false) throw new Error("unsent");
      const next = await refineDraft(draft.id, refinement);
      router.replace(draftUrl(next.id, fromOf(from)));
    } catch (e) {
      setRefineError(e instanceof Error && e.message === "unsent" ? "unsent" : e);
      setRefining(null);
    }
  };

  const goBack = async () => {
    if (draft.previous_draft_id === null) return;
    try {
      await deleteDraft(draft.id);
      router.replace(draftUrl(draft.previous_draft_id, fromOf(from), true));
    } catch (e) {
      setUndoError(e);
    }
  };

  // ---- Making it a lesson -----------------------------------------------------------------------------------
  const problems: Problem[] = showProblems ? contentProblems(content, raw) : [];
  const problemsHeading = useRef<HTMLHeadingElement>(null);
  // The button is in a bar that stays in view, so what it answers with can be far from where the teacher is: it is brought into view.
  const failure = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (unsent || saveError !== null) failure.current?.scrollIntoView({ block: "center" });
  }, [unsent, saveError]);

  const goTo = (p: Problem) => {
    if (p.question) {
      dispatch({ type: "open", id: p.question });
      setChecking(p.question);
      ask(p.question, p.field);
    } else if (p.field === "title") {
      ask("", "title");
    } else {
      ask("", "add");
    }
  };

  const save = async () => {
    if (saving) return;
    setSaving(true);
    setSaveError(null);
    setUnsent(false);
    // What the teacher typed last is in the draft before it is made a lesson.
    if ((await saver.current?.flush()) === false) {
      setUnsent(true);
      setSaving(false);
      return;
    }
    const found = contentProblems(content, raw);
    const lesson = found.length === 0 ? lessonOf(content, raw) : null;
    if (!lesson) {
      setShowProblems(true);
      setSaving(false);
      requestAnimationFrame(() => problemsHeading.current?.focus());
      return;
    }
    try {
      const edit = draft.lesson_id !== null;
      const saved = edit ? await updateLesson(draft.lesson_id as string, { ...lesson, draft_id: draft.id }) : await saveLesson({ ...lesson, draft_id: draft.id });
      // Saving the first lesson is the end of the first run (F-01 step 3). If that cannot be recorded the lesson is saved all the same
      // and the teacher is not sent back to the guide for it; the next visit asks again.
      if (firstRun) {
        try {
          await setFirstRunDone();
        } catch {
          leaveGuideUnsaved();
        }
      }
      router.replace(savedLessonUrl(saved.id, edit ? "changes" : "new", fromOf(from) === FROM_TODAY ? FROM_TODAY : undefined));
    } catch (e) {
      setSaveError(e);
      setSaving(false);
    }
  };

  const back = draft.lesson_id ? { href: lessonUrl(draft.lesson_id, fromOf(from) === FROM_TODAY ? FROM_TODAY : undefined), label: "back.lesson" as const } : backFromLesson(from);
  const unfinishedNumber = hasUnfinishedNumber(raw);
  const room = canAdd(questions.length);

  return (
    <>
      <PageHeader title={content.title.trim() || t("lesson.title")} subtitle={kindLine(t, draft)} back={back.href} backLabel={t(back.label)} />
      <div className="content" ref={root}>
        {/* There before it has anything to say, so that what it says is read out. */}
        <p role="status" className="sr">
          {say}
        </p>

        <section className="card card--stack editor__title" aria-labelledby="editor-title-label">
          <label id="editor-title-label" htmlFor="editor-title" className="prepare__label">
            {t("editor.title.label")}
          </label>
          <input
            id="editor-title"
            type="text"
            className="field"
            data-field="title"
            aria-invalid={problems.some((p) => p.field === "title")}
            value={content.title}
            onChange={(e) => dispatch({ type: "title", text: e.target.value })}
          />
          {draft.emphasis && (
            <p className="prepare__hint">
              <strong>{t("lesson.emphasis")}:</strong> {`„${draft.emphasis}“`}
            </p>
          )}
        </section>

        {refined && last ? (
          <div className="card card--compact draft__note editor__refined">
            <span className="card__icon card__icon--small">
              <ArrowsClockwiseIcon size={24} aria-hidden="true" />
            </span>
            <p>
              <strong>{t(`refined.${last}`)}</strong>
            </p>
            <button
              type="button"
              className="btn btn--secondary btn--small"
              onClick={() => (editedSince(draft) ? setAskingUndo(true) : void goBack())}
            >
              <ArrowArcLeftIcon size={24} aria-hidden="true" />
              {t("refined.undo")}
            </button>
          </div>
        ) : (
          undone && (
            <div className="card card--compact draft__note">
              <span className="card__icon card__icon--small">
                <CheckCircleIcon size={24} weight="fill" aria-hidden="true" />
              </span>
              <p>
                <strong>{t("refined.undone")}</strong>
              </p>
            </div>
          )
        )}
        {undoError !== null && (
          <ProblemBox title={t("refine.fail.title")}>
            <ErrorWords error={undoError} />
          </ProblemBox>
        )}

        <section aria-labelledby="questions">
          <h2 className="section__title" id="questions">
            {t("lesson.questions.title")}
          </h2>
          <ol className="questions">
            {questions.map((q, i) => (
              <Fragment key={q.id}>
                {removed && removed.index === i && <Removed n={removed.index + 1} onRestore={restore} />}
                {open === q.id ? (
                  <QuestionEditor
                    question={q}
                    n={i + 1}
                    total={questions.length}
                    raw={raw[q.id]}
                    problems={checking === q.id ? questionProblems(q, i + 1, raw[q.id]) : null}
                    dispatch={dispatch}
                    canMoveUp={i > 0}
                    canMoveDown={i < questions.length - 1}
                    canDelete={canDelete(questions.length)}
                    focus={focus}
                    onDone={() => finish(q.id)}
                    onMove={(direction, anchor) => move(q.id, direction, anchor)}
                    onDelete={() => remove(q.id)}
                  />
                ) : (
                  <QuestionCard
                    question={q}
                    n={i + 1}
                    total={questions.length}
                    headingId={`h-${q.id}`}
                    actions={
                      <button type="button" className="btn btn--secondary" data-field="edit" aria-describedby={`h-${q.id}`} onClick={() => openQuestion(q.id)}>
                        <PencilSimpleIcon size={24} aria-hidden="true" />
                        {t("question.edit")}
                      </button>
                    }
                  />
                )}
              </Fragment>
            ))}
            {removed && removed.index >= questions.length && <Removed n={removed.index + 1} onRestore={restore} />}
          </ol>

          <div className="editor__add">
            {adding ? (
              <div className="card card--stack">
                <h3 className="editor__label">{t("add.which")}</h3>
                <div className="editor__kinds">
                  {KINDS.map((kind) => (
                    <button key={kind} type="button" className="btn btn--secondary" onClick={() => add(kind)}>
                      {t(`question.kind.${kind}`)}
                    </button>
                  ))}
                  <button type="button" className="btn btn--quiet" onClick={() => dispatch({ type: "choosing", on: false })}>
                    {t("add.cancel")}
                  </button>
                </div>
              </div>
            ) : room ? (
              <button type="button" className="btn btn--secondary" data-field="add" onClick={() => dispatch({ type: "choosing", on: true })}>
                <PlusIcon size={24} aria-hidden="true" />
                {t("add.title")}
              </button>
            ) : (
              <p className="editor__limit">{t("edit.max", { max: QUESTIONS_MAX })}</p>
            )}
          </div>
        </section>

        <section className="card card--stack" aria-labelledby="refine-title">
          <h2 id="refine-title">{t("refine.title")}</h2>
          <p className="prepare__hint">{t("refine.hint")}</p>
          <div className="editor__refine">
            {REFINEMENTS.map((r) => {
              const Icon = REFINE_ICONS[r];
              const possible = canRefine(r, questions.length);
              return (
                <button
                  key={r}
                  type="button"
                  className="btn btn--secondary"
                  aria-disabled={!possible || refining !== null}
                  aria-busy={refining === r}
                  onClick={() => possible && void refine(r)}
                >
                  <Icon size={24} aria-hidden="true" />
                  {t(`refine.${r}`)}
                </button>
              );
            })}
          </div>
          {!canRefine("more_questions", questions.length) && <p className="prepare__hint">{t("refine.more.max", { max: QUESTIONS_MAX })}</p>}
          {refineError !== null && (
            <ProblemBox title={t("refine.fail.title")}>{refineError === "unsent" ? t("save.unsent") : <ErrorWords error={refineError} />}</ProblemBox>
          )}
        </section>

        <section className="card card--stack" aria-labelledby="editor-summary">
          <h2 id="editor-summary">{t("draft.summary")}</h2>
          <p id="editor-summary-hint" className="prepare__hint">
            {t("summary.hint")}
          </p>
          <textarea
            className="field field--area"
            rows={5}
            aria-labelledby="editor-summary"
            aria-describedby="editor-summary-hint"
            value={content.review_summary}
            onChange={(e) => dispatch({ type: "summary", text: e.target.value })}
          />
        </section>

        {problems.length > 0 && (
          <section className="problem problem--list" aria-labelledby="save-problems">
            <span className="problem__badge" aria-hidden="true">
              !
            </span>
            <div>
              <h2 className="problem__title" id="save-problems" tabIndex={-1} ref={problemsHeading}>
                {t("save.problems.title")}
              </h2>
              <p className="problem__body">{t("save.problems.lead")}</p>
              <ul className="problems__list problems__list--links">
                {problems.map((p) => (
                  <li key={`${p.code}-${p.question ?? "x"}-${p.field}`}>
                    <a
                      href={p.question ? `#q-${p.question}` : p.field === "title" ? "#editor-title" : "#questions"}
                      onClick={(e) => {
                        e.preventDefault();
                        goTo(p);
                      }}
                    >
                      {problemWords(t, p)}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}
        {(unsent || saveError !== null) && (
          <div ref={failure}>
            {unsent && <ProblemBox>{t("save.unsent")}</ProblemBox>}
            {saveError !== null && (
              <ProblemBox title={t("save.failed.title")}>
                <ErrorWords error={saveError} />
              </ProblemBox>
            )}
          </div>
        )}

        {/*
          The one yellow button and where saving stands are one bar that stays at the bottom of the window while the page is longer than
          it, so the way to make this a lesson is never a scroll away; on a short window (a zoomed one) it is part of the page instead.
        */}
        <div className="savebar">
          <button type="button" className="btn btn--primary" aria-busy={saving} aria-describedby="save-note" onClick={() => void save()}>
            <FloppyDiskIcon size={24} weight="fill" aria-hidden="true" />
            {t(draft.lesson_id ? "save.changes" : "save.new")}
          </button>
          <SaveState status={status} />
        </div>
        <div className="prepare__go" id="save-note">
          <p>{t(draft.lesson_id ? "save.changes.note" : "save.new.note")}</p>
          <p>{t("editor.kept", { days: DRAFT_RETENTION_DAYS })}</p>
        </div>

        {/* A change that is only waiting for its moment is sent as the page goes; one that could not be sent, or a number that is not one yet, would be lost. */}
        {losesWorkOnLeaving(status, unfinishedNumber) && <LeaveGuard body="editor.leave.body" />}
      </div>
      <ConfirmDialog
        open={askingUndo}
        title={t("undo.title")}
        body={t("undo.body")}
        stay={t("undo.stay")}
        confirm={t("undo.confirm")}
        onStay={() => setAskingUndo(false)}
        onConfirm={() => {
          setAskingUndo(false);
          void goBack();
        }}
      />
    </>
  );
}

/** Where the question that was deleted was, with the one way to bring it back. */
function Removed({ n, onRestore }: { n: number; onRestore: () => void }) {
  const { t } = useT();
  return (
    <li className="question question--removed">
      <p>{t("edit.deleted", { n })}</p>
      <button type="button" className="btn btn--secondary" data-field="undo" onClick={onRestore}>
        <ArrowArcLeftIcon size={24} aria-hidden="true" />
        {t("edit.undo")}
      </button>
    </li>
  );
}

function ErrorWords({ error }: { error: unknown }): ReactNode {
  const { te } = useT();
  return te(error);
}
