"use client";

import { CircleIcon, CheckCircleIcon, PaperPlaneTiltIcon } from "@phosphor-icons/react";
import { useEffect, useId, useRef, useState } from "react";
import { fireAdhoc } from "@/lib/teacher/api/hooks";
import type { QuestionKind } from "@/lib/teacher/api/types";
import { useT, type Key } from "@/lib/teacher/i18n";
import {
  ADHOC_OPTION_MAX,
  ADHOC_PROMPT_MAX,
  checkAdhoc,
  defaultSeconds,
  emptyAdhoc,
  optionLetter,
  type AdhocDraft,
  type AdhocProblem,
} from "@/lib/teacher/questions";
import { Choices } from "./Choices";
import { Problem } from "./Problem";

const KINDS: readonly QuestionKind[] = ["true_false", "multiple_choice", "numeric"];

const PROBLEM_WORDS = {
  prompt: "q.adhoc.err.prompt",
  prompt_long: "q.adhoc.err.prompt_long",
  options: "q.adhoc.err.options",
  option_long: "q.adhoc.err.option_long",
  correct: "q.adhoc.err.correct",
  number: "q.adhoc.err.number",
  unit_long: "q.adhoc.err.unit_long",
  time: "q.adhoc.err.time",
} as const satisfies Record<AdhocProblem, Key>;

/**
 * "Брзо прашање" (FR-POP-04): one short screen. The kind, the question, the right answer and the time, with the time already filled in for the kind.
 * It is sent at once and the panel takes it over. Nothing is checked until the yellow button is pressed, and then every problem is listed in plain words.
 */
export function AdhocDialog({ sessionId, onClose }: { sessionId: string; onClose: () => void }) {
  const { t, te } = useT();
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useId();
  const id = useId();
  const [draft, setDraft] = useState<AdhocDraft>(() => emptyAdhoc());
  const [timeTouched, setTimeTouched] = useState(false);
  const [problems, setProblems] = useState<AdhocProblem[]>([]);
  const [failed, setFailed] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const set = (change: Partial<AdhocDraft>) => setDraft((d) => ({ ...d, ...change }));

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (!d.open) d.showModal();
    d.querySelector<HTMLElement>("textarea")?.focus();
  }, []);

  const send = async () => {
    if (busy) return;
    const checked = checkAdhoc(draft);
    if (!checked.ok) {
      setProblems(checked.problems);
      dialog.current?.querySelector<HTMLElement>('[role="alert"]')?.scrollIntoView({ block: "nearest" });
      return;
    }
    setProblems([]);
    setFailed(null);
    setBusy(true);
    try {
      await fireAdhoc(sessionId, checked.request);
      dialog.current?.close();
    } catch (e) {
      setFailed(e);
      setBusy(false);
    }
  };

  const bad = (p: AdhocProblem) => problems.includes(p);

  return (
    <dialog ref={dialog} className="dialog dialog--adhoc" aria-labelledby={heading} onClose={onClose}>
      <h2 id={heading} className="dialog__title">
        {t("q.adhoc.title")}
      </h2>
      <p className="dialog__body">{t("q.adhoc.body")}</p>

      <Choices
        name="adhoc-kind"
        legend={t("q.adhoc.kind")}
        value={draft.kind}
        onChange={(kind) => {
          // The time follows the kind until the teacher has written their own.
          set({ kind, correct: "", seconds: timeTouched ? draft.seconds : String(defaultSeconds(kind)) });
        }}
        options={KINDS.map((value) => ({ value, label: t(`q.adhoc.kind.${value}` as Key) }))}
      />

      <div className="editor__field">
        <label htmlFor={`${id}-prompt`} className="editor__label">
          {t("q.adhoc.prompt")}
        </label>
        <textarea
          id={`${id}-prompt`}
          className="field field--area field--short"
          rows={2}
          maxLength={ADHOC_PROMPT_MAX + 40}
          value={draft.prompt}
          aria-invalid={bad("prompt") || bad("prompt_long")}
          onChange={(e) => set({ prompt: e.target.value })}
        />
      </div>

      {draft.kind === "multiple_choice" && (
        <fieldset className="adhoc__options">
          <legend className="editor__label">{t("q.adhoc.options")}</legend>
          {draft.options.map((value, i) => {
            const letter = optionLetter(i);
            const right = draft.correct === String(i);
            return (
              <div key={i} className="adhoc__option">
                <label htmlFor={`${id}-o${i}`} className="adhoc__letter">
                  {letter}
                </label>
                <input
                  id={`${id}-o${i}`}
                  type="text"
                  className="field"
                  aria-label={t("q.adhoc.option", { letter })}
                  maxLength={ADHOC_OPTION_MAX + 20}
                  value={value}
                  onChange={(e) => set({ options: draft.options.map((o, j) => (j === i ? e.target.value : o)) })}
                />
                <label className="adhoc__right" data-checked={right}>
                  <input type="radio" name={`${id}-right`} checked={right} aria-label={t("q.adhoc.right.name", { letter })} onChange={() => set({ correct: String(i) })} />
                  {right ? <CheckCircleIcon size={28} weight="fill" aria-hidden="true" /> : <CircleIcon size={28} aria-hidden="true" />}
                  <span>{t("q.adhoc.right")}</span>
                </label>
              </div>
            );
          })}
        </fieldset>
      )}

      {draft.kind === "true_false" && (
        <Choices
          name="adhoc-correct"
          legend={t("q.adhoc.correct")}
          value={draft.correct === "true" || draft.correct === "false" ? draft.correct : null}
          onChange={(correct) => set({ correct })}
          options={[
            { value: "true", label: t("q.adhoc.true") },
            { value: "false", label: t("q.adhoc.false") },
          ]}
        />
      )}

      {draft.kind === "numeric" && (
        <div className="adhoc__number">
          <div className="editor__field">
            <label htmlFor={`${id}-answer`} className="editor__label">
              {t("q.adhoc.number")}
            </label>
            <input
              id={`${id}-answer`}
              type="text"
              inputMode="decimal"
              className="field editor__short"
              value={draft.correct}
              aria-invalid={bad("number") || bad("correct")}
              onChange={(e) => set({ correct: e.target.value })}
            />
          </div>
          <div className="editor__field">
            <label htmlFor={`${id}-unit`} className="editor__label">
              {t("q.adhoc.unit")}
            </label>
            <input id={`${id}-unit`} type="text" className="field editor__short" value={draft.unit} onChange={(e) => set({ unit: e.target.value })} />
          </div>
        </div>
      )}

      <div className="editor__field">
        <label htmlFor={`${id}-time`} className="editor__label">
          {t("q.adhoc.time")}
        </label>
        <p id={`${id}-time-hint`} className="editor__hint">
          {t("q.adhoc.time.hint")}
        </p>
        <input
          id={`${id}-time`}
          type="text"
          inputMode="numeric"
          className="field editor__number"
          aria-describedby={`${id}-time-hint`}
          aria-invalid={bad("time")}
          value={draft.seconds}
          onChange={(e) => {
            setTimeTouched(true);
            set({ seconds: e.target.value });
          }}
        />
      </div>

      {problems.length > 0 && (
        <Problem title={t("q.adhoc.err.list")}>
          {problems.map((p) => t(PROBLEM_WORDS[p])).join(" ")}
        </Problem>
      )}
      {failed !== null && <Problem title={t("q.adhoc.failed")}>{te(failed)}</Problem>}

      <div className="dialog__actions">
        <button type="button" className="btn btn--primary" aria-busy={busy} disabled={busy} onClick={() => void send()}>
          <PaperPlaneTiltIcon size={24} weight="fill" aria-hidden="true" />
          {t("q.adhoc.send")}
        </button>
        <button type="button" className="btn btn--secondary" onClick={() => dialog.current?.close()}>
          {t("start.cancel")}
        </button>
      </div>
    </dialog>
  );
}
