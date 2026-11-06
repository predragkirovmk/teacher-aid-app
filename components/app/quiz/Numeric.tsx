"use client";

import { MinusIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { startTransition, useId, useRef, useState, ViewTransition } from "react";
import type { Locale, SessionQuestion } from "@/lib/app/api/types";
import { formatNumeric, parseNumeric, toggleMinus, withUnit, type NumericProblem } from "@/lib/app/numeric";
import { useQT, type QKey } from "@/lib/app/quiz-copy";
import type { SessionRunView } from "@/lib/app/session/controller";
import { QuizTop, TimerRing, buzz } from "./parts";

const PROBLEM: Record<NumericProblem, QKey> = { empty: "n.err.empty", not_number: "n.err.nan", negative: "n.err.negative" };

/** A number as the student reads it in their language, with its unit: `-2.5` and `m/s²` become `−2,5 m/s²`. */
export const numberText = (value: string, q: SessionQuestion, locale: Locale) => withUnit(formatNumeric(value, locale), q.numeric?.unit ?? null);

/**
 * A numeric question (spec FR-ANS-02). The field asks the phone for its decimal pad (`inputmode="decimal"`),
 * and takes a comma or a point; that pad has no minus on iOS, so a key of its own sits beside the field when
 * the question allows a negative answer. The whole form is in the top half of the screen, so the keyboard
 * never covers the button that locks the answer in. What is wrong with the text is said in words under the
 * field, on the lock button's press: an empty field, something that is not a number, a minus the question
 * does not take.
 */
export function NumericQuestion({ run, onLeave, onPick }: { run: SessionRunView; onLeave: () => void; onPick: (response: string) => void }) {
  const { t } = useQT();
  const q = run.question!;
  const info = q.numeric ?? { unit: null, tolerance: 0, allowNegative: false };

  return (
    <>
      <QuizTop
        onLeave={onLeave}
        label={t("q.progress", { n: q.index + 1, total: q.total })}
        done={q.index + 1}
        total={q.total}
        right={<TimerRing key={q.id} duration={run.duration} elapsedAtMount={run.elapsed} seconds={run.secondsLeft} />}
      />
      <div className="q-body q-ask q-ask--num" key={`ask-${q.id}`}>
        <h1 className="q-question q-question--num">{q.prompt}</h1>
        <NumberField
          unit={info.unit}
          allowNegative={info.allowNegative}
          submitLabel={t("n.lock")}
          morph
          onSubmit={(value) => {
            buzz(14);
            startTransition(() => onPick(value));
          }}
        />
      </div>
    </>
  );
}

/**
 * The number field and the button that sends it, shared by the live quiz and practice. It reads what was typed
 * (lib/app/numeric.ts) and hands the canonical text to `onSubmit`, or says in words what is wrong with it.
 * `morph` names the field for the view transition into the locked card; `locked` shows a number already given.
 */
export function NumberField({
  unit,
  allowNegative,
  submitLabel,
  onSubmit,
  morph = false,
  locked = null,
  autoFocus = true,
}: {
  unit: string | null;
  allowNegative: boolean;
  submitLabel: string;
  onSubmit: (value: string) => void;
  morph?: boolean;
  /** A number the student has given, shown in the field, which is then closed. */
  locked?: string | null;
  autoFocus?: boolean;
}) {
  const { t } = useQT();
  const [text, setText] = useState("");
  const [problem, setProblem] = useState<NumericProblem | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;

  const lock = () => {
    const parsed = parseNumeric(text, allowNegative);
    if (!parsed.ok) {
      setProblem(parsed.problem);
      buzz(40);
      input.current?.focus();
      return;
    }
    onSubmit(parsed.value);
  };

  const box = (
    <div className="n-box" data-invalid={problem !== null}>
      <input
        ref={input}
        id={id}
        className="n-input"
        type="text"
        inputMode="decimal"
        enterKeyHint="send"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        autoFocus={autoFocus && locked === null}
        maxLength={20}
        value={locked ?? text}
        readOnly={locked !== null}
        aria-invalid={problem !== null}
        aria-describedby={problem ? errorId : hintId}
        onChange={(e) => {
          setText(e.target.value);
          setProblem(null);
        }}
      />
      {unit && (
        <span className="n-unit" aria-hidden="true">
          {unit}
        </span>
      )}
    </div>
  );

  return (
    <form
      className="n-form"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (locked === null) lock();
      }}
    >
      <label className="t-label n-label" htmlFor={id}>
        {t("n.label")}
      </label>
      <div className="n-row">
        {allowNegative && locked === null && (
          <button
            type="button"
            className="n-minus"
            aria-label={t("n.minus")}
            onClick={() => {
              setText(toggleMinus(text));
              setProblem(null);
              // Keeps the keypad up: the tap would otherwise take the focus with it.
              input.current?.focus();
            }}
          >
            <MinusIcon size={26} weight="bold" aria-hidden="true" />
          </button>
        )}
        {morph ? (
          <ViewTransition name="q-pick-n" share="q-morph" default="none">
            {box}
          </ViewTransition>
        ) : (
          box
        )}
      </div>
      {/* One slot for the hint and the problem, so the lock button does not move when a problem appears. */}
      <div className="n-slot">
        {problem ? (
          <p id={errorId} className="n-err" role="alert">
            <WarningCircleIcon size={20} weight="bold" aria-hidden="true" />
            {t(PROBLEM[problem])}
          </p>
        ) : (
          <p id={hintId} className="t-cap n-hint">
            {unit ? t("n.hintUnit", { unit }) : t("n.hint")}
          </p>
        )}
      </div>
      {locked === null && (
        <button type="submit" className="btn btn--primary btn--block n-lock">
          {submitLabel}
        </button>
      )}
    </form>
  );
}
