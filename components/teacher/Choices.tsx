"use client";

import { CheckCircleIcon, CircleIcon } from "@phosphor-icons/react";
import { useId, type ReactNode } from "react";

export type Choice<V extends string> = { value: V; label: string; lang?: string };

/**
 * A few large radio choices on one card. Real radio buttons, so the arrow keys work; the chosen
 * row has a filled tick, a bold label and a white edge, never colour alone.
 */
export function Choices<V extends string>({
  name,
  legend,
  tag,
  hint,
  value,
  options,
  onChange,
}: {
  name: string;
  legend: string;
  /** A small word beside the legend, such as "Demo setting". */
  tag?: string;
  hint?: ReactNode;
  value: V;
  options: Choice<V>[];
  onChange: (value: V) => void;
}) {
  const heading = useId();
  return (
    <div className="card choices" role="radiogroup" aria-labelledby={heading}>
      <h2 id={heading}>
        {legend}
        {tag && <span className="tag">{tag}</span>}
      </h2>
      {options.map((o) => {
        const checked = o.value === value;
        return (
          <label key={o.value} className="choice" data-checked={checked}>
            <input type="radio" name={name} value={o.value} checked={checked} onChange={() => onChange(o.value)} />
            {checked ? <CheckCircleIcon size={28} weight="fill" aria-hidden="true" /> : <CircleIcon size={28} aria-hidden="true" />}
            <span lang={o.lang}>{o.label}</span>
          </label>
        );
      })}
      {hint}
    </div>
  );
}
