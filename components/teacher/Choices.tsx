"use client";

import { CheckCircleIcon, CircleIcon } from "@phosphor-icons/react";
import { useId, type ReactNode } from "react";

export type Choice<V extends string> = { value: V; label: string; /** A second, quieter part of the row, at its end. */ detail?: string; lang?: string };

/**
 * A few large radio choices on one card. Real radio buttons, so the arrow keys work; the chosen
 * row has a filled tick, a heavier label and an edge, never colour alone. With `labelledBy` (the id
 * of a heading that is already there, such as a window's title) the choices come bare, with no card
 * and no heading of their own, and with no `value` yet none is chosen.
 */
export function Choices<V extends string>({
  name,
  legend,
  labelledBy,
  describedBy,
  tag,
  hint,
  value,
  options,
  onChange,
}: {
  name: string;
  legend?: string;
  labelledBy?: string;
  describedBy?: string;
  /** A small word beside the legend, such as "Demo setting". */
  tag?: string;
  hint?: ReactNode;
  value: V | null;
  options: Choice<V>[];
  onChange: (value: V) => void;
}) {
  const heading = useId();
  const bare = labelledBy !== undefined;
  return (
    <div className={bare ? "choices" : "card choices"} role="radiogroup" aria-labelledby={labelledBy ?? heading} aria-describedby={describedBy}>
      {!bare && (
        <h2 id={heading}>
          {legend}
          {tag && <span className="tag">{tag}</span>}
        </h2>
      )}
      {options.map((o) => {
        const checked = o.value === value;
        return (
          <label key={o.value} className="choice" data-checked={checked}>
            <input type="radio" name={name} value={o.value} checked={checked} onChange={() => onChange(o.value)} />
            {checked ? <CheckCircleIcon size={28} weight="fill" aria-hidden="true" /> : <CircleIcon size={28} aria-hidden="true" />}
            <span lang={o.lang} className="choice__text">
              {o.label}
            </span>
            {o.detail && <span className="choice__detail">{o.detail}</span>}
          </label>
        );
      })}
      {hint}
    </div>
  );
}
