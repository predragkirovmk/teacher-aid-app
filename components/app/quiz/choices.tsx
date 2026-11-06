"use client";

import { CheckIcon, XIcon } from "@phosphor-icons/react";
import { ViewTransition, type CSSProperties } from "react";
import { useT } from "@/lib/app/i18n";
import { LETTERS } from "@/lib/app/quiz";
import { useQT } from "@/lib/app/quiz-copy";

/** What a choice screen needs of a question: a multiple-choice question's options, or true or false. */
export type ChoiceQuestion = { kind: string; options: string[] | null };

/** The index of the choice a response names: the option number, or 0 for true and 1 for false. */
export const choiceOf = (q: Pick<ChoiceQuestion, "kind">, response: string) => (q.kind === "true_false" ? (response === "true" ? 0 : 1) : Number(response));

/** The response (spec 3.2) for the choice at index `i`. */
export const responseOf = (q: Pick<ChoiceQuestion, "kind">, i: number) => (q.kind === "true_false" ? (i === 0 ? "true" : "false") : String(i));

/** The words and the mark of each choice: A, B, C and D, or a check and a cross for true and false. */
export function useChoiceLabels(q: ChoiceQuestion) {
  const { t, locale } = useQT();
  return {
    letters: LETTERS[locale],
    label: (i: number) => (q.kind === "true_false" ? t(i === 0 ? "q.true" : "q.false") : (q.options?.[i] ?? "")),
    mark: (i: number) =>
      q.kind === "true_false" ? i === 0 ? <CheckIcon size={22} weight="bold" aria-hidden="true" /> : <XIcon size={22} weight="bold" aria-hidden="true" /> : LETTERS[locale][i],
  };
}

/**
 * The choices of a multiple-choice or a true-or-false question: the live quiz taps one to lock it in; practice taps one to pick it and checks it
 * afterwards. `morph` gives each a name for the view transition into the locked card. Once `picked` is set the choices hold a student's pick
 * (`aria-pressed`); once `shown` is set they are closed and mark the right choice and the student's, each with an icon and a word for screen
 * readers as well as a look, so right and wrong never rest on colour.
 */
export function Choices({
  q,
  onPick,
  morph = false,
  picked = null,
  shown = null,
  locked = false,
}: {
  q: ChoiceQuestion;
  onPick: (i: number) => void;
  morph?: boolean;
  picked?: number | null;
  shown?: { right: number | null } | null;
  /** The pick is in but the verdict is not: closed, with the pick still held. */
  locked?: boolean;
}) {
  const { t } = useT();
  const { letters, label } = useChoiceLabels(q);
  const wrap = (i: number, node: React.ReactElement) =>
    morph ? (
      <ViewTransition key={i} name={`q-pick-${i}`} share="q-morph" default="none">
        {node}
      </ViewTransition>
    ) : (
      node
    );
  /** How a choice reads once the answer is shown. */
  const stateOf = (i: number) => (!shown ? undefined : i === shown.right ? "right" : i === picked ? "miss" : "rest");
  const said = (i: number) => (!shown ? null : i === shown.right ? t("pr.rightChoice") : i === picked ? t("pr.yourChoice") : null);

  return q.kind === "multiple_choice" ? (
    <div className="q-options">
      {(q.options ?? []).map((o, i) =>
        wrap(
          i,
          <button
            key={i}
            className="q-opt"
            style={{ "--i": i } as CSSProperties}
            aria-pressed={shown ? undefined : picked === i}
            disabled={!!shown || locked}
            data-state={stateOf(i)}
            onClick={() => onPick(i)}
          >
            <span className="q-letter">
              {stateOf(i) === "right" ? <CheckIcon size={22} weight="bold" aria-hidden="true" /> : stateOf(i) === "miss" ? <XIcon size={22} weight="bold" aria-hidden="true" /> : letters[i]}
            </span>
            <span>
              {o}
              {said(i) && <span className="sr"> ({said(i)})</span>}
            </span>
          </button>,
        ),
      )}
    </div>
  ) : (
    <div className="q-tf">
      {[0, 1].map((i) =>
        wrap(
          i,
          <button
            key={i}
            className="q-tf__btn"
            style={{ "--i": i } as CSSProperties}
            aria-pressed={shown ? undefined : picked === i}
            disabled={!!shown || locked}
            data-state={stateOf(i)}
            onClick={() => onPick(i)}
          >
            <span className="q-tf__icon">{i === 0 ? <CheckIcon size={38} weight="bold" aria-hidden="true" /> : <XIcon size={38} weight="bold" aria-hidden="true" />}</span>
            <span className="q-tf__label">
              {label(i)}
              {said(i) && <span className="sr"> ({said(i)})</span>}
            </span>
          </button>,
        ),
      )}
    </div>
  );
}
