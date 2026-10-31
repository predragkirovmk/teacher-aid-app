"use client";

import { ArrowDownIcon, ArrowUpIcon, CheckCircleIcon, CheckIcon, CircleIcon, PlusIcon, TrashIcon, XIcon } from "@phosphor-icons/react";
import { useEffect, useId, useRef, type Dispatch, type ReactNode } from "react";
import type { DraftQuestion, QuestionKind } from "@/lib/teacher/api/types";
import type { EditorAction } from "@/lib/teacher/editor-state";
import { addOption, canAddOption, canRemoveOption, KINDS, nudgeTimer, removeOption, setOption, type Field, type Problem, type RawText } from "@/lib/teacher/editor";
import { decimal } from "@/lib/teacher/format";
import { useT } from "@/lib/teacher/i18n";
import { QUESTIONS_MIN } from "@/lib/teacher/scoring";
import { Choices } from "./Choices";
import { problemWords } from "./problemWords";

/**
 * Where the focus is sent: a field of a question, or the button that opens it. `nonce` makes the same request twice a request twice.
 * `anchor` is where a button was on the screen (its distance from the top of the window) when it moved the question: the page is then
 * scrolled so that the button is there again, since the question has moved and the teacher's eyes are on the button.
 */
export type FocusRequest = { id: string; field: Field | "edit" | "undo" | "up" | "down" | "done"; nonce: number; anchor?: number } | null;

/**
 * Put the focus on the field the request names, inside `root`; a button that is not there any more (the question moved to the end of
 * the list, and "Надолу" went) sends it to "Готово". A group of choices takes the focus on its chosen one.
 */
export function focusField(root: ParentNode, field: string, anchor?: number): boolean {
  const el = root.querySelector<HTMLElement>(`[data-field="${field}"]`) ?? (field === "up" || field === "down" ? root.querySelector<HTMLElement>('[data-field="done"]') : null);
  // A group takes the focus on its chosen choice, else on its first choice; a box that holds other things, on the first of them.
  const target = el?.matches("input, textarea, button, [tabindex]")
    ? el
    : (el?.querySelector<HTMLElement>("input:checked") ?? el?.querySelector<HTMLElement>('input[type="radio"]') ?? el?.querySelector<HTMLElement>("input, textarea, button"));
  target?.focus();
  // A button that was pressed to move the question is where it was in the window, whichever way the page has shifted under it.
  if (target && anchor !== undefined) {
    const shift = target.getBoundingClientRect().top - anchor;
    if (Math.abs(shift) > 1) window.scrollBy({ top: shift, behavior: "instant" });
  }
  return !!target;
}

/** The problems of a question as a box under the fields: what is not finished, in words, read out when it appears. */
export function QuestionProblems({ problems }: { problems: Problem[] }) {
  const { t } = useT();
  return (
    <div className="problem" role="alert">
      <span className="problem__badge" aria-hidden="true">
        !
      </span>
      <div>
        <p className="problem__title">{t("edit.notready")}</p>
        <ul className="problems__list">
          {problems.map((p) => (
            <li key={`${p.code}-${p.field}`}>{problemWords(t, p)}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="editor__field">
      <label htmlFor={id} className="editor__label">
        {label}
      </label>
      {hint && (
        <p id={`${id}-hint`} className="editor__hint">
          {hint}
        </p>
      )}
      {children}
    </div>
  );
}

/**
 * One question, open for editing: its words, its kind, its answers by kind, why, its time and its topic, and under them the means to
 * finish it, move it and delete it. Every field is a plain box or a few large choices with a label that says what it is for. What
 * is typed goes into the lesson as it is typed (the page saves it); a time or a tolerance that is not a number yet stays in its box
 * and is a problem of the question until it is. The buttons that move and delete are here and not on the card that is read, so
 * that a card has one button, and the question that is being worked on is the one that has the rest.
 */
export function QuestionEditor({
  question: q,
  n,
  total,
  raw,
  problems,
  dispatch,
  canMoveUp,
  canMoveDown,
  canDelete,
  focus,
  onDone,
  onMove,
  onDelete,
}: {
  question: DraftQuestion;
  n: number;
  total: number;
  raw: RawText[string] | undefined;
  /** What was found wrong when the teacher tried to finish; kept up to date while it is shown, and null before then. */
  problems: Problem[] | null;
  dispatch: Dispatch<EditorAction>;
  canMoveUp: boolean;
  canMoveDown: boolean;
  canDelete: boolean;
  focus: FocusRequest;
  onDone: () => void;
  /** `anchor`: where the button that was pressed is in the window, so that the page can keep it there. */
  onMove: (direction: "up" | "down", anchor: number) => void;
  onDelete: () => void;
}) {
  const { t, locale } = useT();
  const uid = useId();
  const root = useRef<HTMLLIElement>(null);
  const id = (name: string) => `${uid}-${name}`;
  const set = (change: Record<string, unknown>) => dispatch({ type: "question", question: { ...q, ...change } as DraftQuestion });

  useEffect(() => {
    if (focus && focus.id === q.id && focus.field !== "edit" && root.current) focusField(root.current, focus.field, focus.anchor);
  }, [focus, q.id]);

  const invalid = (field: Field) => problems?.some((p) => p.field === field) ?? false;
  const timerText = raw?.timer ?? String(q.timer_seconds);

  return (
    <li className="question question--open" id={`q-${q.id}`} ref={root}>
      <div className="question__top">
        <h3 className="question__n">{t("question.n", { n, total })}</h3>
      </div>

      {/* Under the question's number, so that it is in view with the box the focus goes to: the first thing that is wrong is at the top of the card more often than not. */}
      {problems && problems.length > 0 && <QuestionProblems problems={problems} />}

      <Field id={id("prompt")} label={t("edit.prompt")}>
        <textarea
          id={id("prompt")}
          className="field field--area"
          rows={3}
          data-field="prompt"
          value={q.prompt}
          aria-invalid={invalid("prompt")}
          onChange={(e) => set({ prompt: e.target.value })}
        />
      </Field>

      <div className="editor__field" data-field="kind">
        <h4 className="editor__label" id={id("kind")}>
          {t("edit.kind")}
        </h4>
        {/* Side by side where there is room, one under the other where there is not, as the kinds of material are on the form. */}
        <div className="prepare__tiles">
          <Choices<QuestionKind>
            name={`kind-${q.id}`}
            labelledBy={id("kind")}
            value={q.kind}
            options={KINDS.map((k) => ({ value: k, label: t(`question.kind.${k}`) }))}
            onChange={(kind) => dispatch({ type: "kind", id: q.id, kind })}
          />
        </div>
      </div>

      {q.kind === "multiple_choice" && (
        <fieldset className="editor__group" data-field="right">
          <legend className="editor__label">{t("edit.options")}</legend>
          <p className="editor__hint">{t("edit.options.hint")}</p>
          <ul className="opts">
            {q.options.map((text, i) => {
              const right = q.correct === String(i);
              return (
                <li key={i} className="opt" data-right={right}>
                  <input
                    type="text"
                    className="field opt__text"
                    data-field={`option-${i}`}
                    aria-label={t("edit.option", { n: i + 1 })}
                    aria-invalid={invalid(`option-${i}`)}
                    value={text}
                    onChange={(e) => set(setOption(q, i, e.target.value))}
                  />
                  {/* Only the right answer says it is right ("Точен одговор", a tick); the others say what pressing them does, so no row reads as right by default. */}
                  <label className="choice opt__right" data-checked={right}>
                    <input
                      type="radio"
                      name={`right-${q.id}`}
                      checked={right}
                      aria-label={t(right ? "edit.option.right.label" : "edit.option.mark.label", { n: i + 1 })}
                      onChange={() => set({ correct: String(i) })}
                    />
                    {right ? <CheckCircleIcon size={28} weight="fill" aria-hidden="true" /> : <CircleIcon size={28} aria-hidden="true" />}
                    <span>{t(right ? "edit.option.right" : "edit.option.mark")}</span>
                  </label>
                  {canRemoveOption(q) && (
                    <button type="button" className="btn btn--secondary btn--small opt__remove" aria-label={t("edit.option.remove.label", { n: i + 1 })} onClick={() => set(removeOption(q, i))}>
                      <XIcon size={24} aria-hidden="true" />
                      {t("edit.option.remove")}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          {canAddOption(q) && (
            <div>
              <button type="button" className="btn btn--secondary btn--small" onClick={() => set(addOption(q))}>
                <PlusIcon size={24} aria-hidden="true" />
                {t("edit.option.add")}
              </button>
            </div>
          )}
        </fieldset>
      )}

      {q.kind === "true_false" && (
        <div className="editor__field" data-field="right">
          <h4 className="editor__label" id={id("tf")}>
            {t("edit.truefalse")}
          </h4>
          <Choices<"true" | "false">
            name={`tf-${q.id}`}
            labelledBy={id("tf")}
            value={q.correct === "" ? null : q.correct}
            options={[
              { value: "true", label: t("question.true") },
              { value: "false", label: t("question.false") },
            ]}
            onChange={(correct) => set({ correct })}
          />
        </div>
      )}

      {q.kind === "numeric" && (
        <>
          <Field id={id("answer")} label={t("edit.answer")} hint={t("edit.answer.hint")}>
            <input
              id={id("answer")}
              type="text"
              inputMode="decimal"
              className="field editor__short"
              data-field="answer"
              aria-describedby={`${id("answer")}-hint`}
              aria-invalid={invalid("answer")}
              value={q.correct}
              onChange={(e) => set({ correct: e.target.value })}
            />
          </Field>
          <Field id={id("unit")} label={t("edit.unit")} hint={t("edit.unit.hint")}>
            <input
              id={id("unit")}
              type="text"
              className="field editor__short"
              aria-describedby={`${id("unit")}-hint`}
              value={q.unit ?? ""}
              onChange={(e) => set({ unit: e.target.value === "" ? null : e.target.value })}
            />
          </Field>
          <Field id={id("tolerance")} label={t("edit.tolerance")} hint={t("edit.tolerance.hint")}>
            <input
              id={id("tolerance")}
              type="text"
              inputMode="decimal"
              className="field editor__short"
              data-field="tolerance"
              aria-describedby={`${id("tolerance")}-hint`}
              aria-invalid={invalid("tolerance")}
              value={raw?.tolerance ?? decimal(String(q.tolerance), locale)}
              onChange={(e) => dispatch({ type: "tolerance", id: q.id, text: e.target.value })}
            />
          </Field>
          <label className="choice editor__check" data-checked={q.allow_negative}>
            <input type="checkbox" checked={q.allow_negative} aria-describedby={`${id("negative")}-hint`} onChange={(e) => set({ allow_negative: e.target.checked })} />
            {q.allow_negative ? <CheckCircleIcon size={28} weight="fill" aria-hidden="true" /> : <CircleIcon size={28} aria-hidden="true" />}
            <span>{t("edit.negative")}</span>
          </label>
          <p id={`${id("negative")}-hint`} className="editor__hint">
            {t("edit.negative.hint")}
          </p>
        </>
      )}

      <Field id={id("why")} label={t("edit.explanation")} hint={t("edit.explanation.hint")}>
        <textarea
          id={id("why")}
          className="field field--area field--short"
          rows={2}
          aria-describedby={`${id("why")}-hint`}
          value={q.explanation ?? ""}
          onChange={(e) => set({ explanation: e.target.value === "" ? null : e.target.value })}
        />
      </Field>

      <div className="editor__field">
        <label htmlFor={id("timer")} className="editor__label">
          {t("edit.timer")}
        </label>
        <p id={`${id("timer")}-hint`} className="editor__hint">
          {t("edit.timer.hint")}
        </p>
        <div className="editor__timer">
          <button type="button" className="btn btn--secondary btn--small" onClick={() => dispatch({ type: "timer", id: q.id, text: String(nudgeTimer(q.timer_seconds, -5)) })}>
            {t("edit.timer.less")}
          </button>
          <input
            id={id("timer")}
            type="text"
            inputMode="numeric"
            className="field editor__number"
            data-field="timer"
            aria-describedby={`${id("timer")}-hint`}
            aria-invalid={invalid("timer")}
            value={timerText}
            onChange={(e) => dispatch({ type: "timer", id: q.id, text: e.target.value })}
          />
          <button type="button" className="btn btn--secondary btn--small" onClick={() => dispatch({ type: "timer", id: q.id, text: String(nudgeTimer(q.timer_seconds, 5)) })}>
            {t("edit.timer.more")}
          </button>
        </div>
      </div>

      <Field id={id("topic")} label={t("edit.topic")} hint={t("edit.topic.hint")}>
        <input id={id("topic")} type="text" className="field" aria-describedby={`${id("topic")}-hint`} value={q.topic} onChange={(e) => set({ topic: e.target.value })} />
      </Field>

      <div className="question__actions question__actions--open">
        <button type="button" className="btn btn--secondary" data-field="done" onClick={onDone}>
          <CheckIcon size={24} weight="bold" aria-hidden="true" />
          {t("question.done")}
        </button>
        {canMoveUp && (
          <button type="button" className="btn btn--secondary" data-field="up" onClick={(e) => onMove("up", e.currentTarget.getBoundingClientRect().top)}>
            <ArrowUpIcon size={24} aria-hidden="true" />
            {t("question.up")}
          </button>
        )}
        {canMoveDown && (
          <button type="button" className="btn btn--secondary" data-field="down" onClick={(e) => onMove("down", e.currentTarget.getBoundingClientRect().top)}>
            <ArrowDownIcon size={24} aria-hidden="true" />
            {t("question.down")}
          </button>
        )}
        {canDelete && (
          <button type="button" className="btn btn--secondary" onClick={onDelete}>
            <TrashIcon size={24} aria-hidden="true" />
            {t("question.delete")}
          </button>
        )}
      </div>
      {!canDelete && <p className="editor__hint">{t("edit.min", { min: QUESTIONS_MIN })}</p>}
    </li>
  );
}
