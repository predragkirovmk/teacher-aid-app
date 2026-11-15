"use client";

import { useId, type ReactNode } from "react";

/**
 * One row of a settings list: what it is on the left (a name, at times a small tag, and a line that says what it does) and its
 * control at the right, where the eye looks for it. In a narrow window the control goes under the words. What a row opens (the steps
 * to install) comes under it, across the whole row. The control gets the ids of the name and of the line, so a group of choices can
 * be named by the row's own heading and not by a second one.
 */
export function SettingRow({
  title,
  tag,
  hint,
  control,
  children,
}: {
  title?: string;
  /** A small word beside the name, such as "Demo setting". */
  tag?: string;
  hint?: ReactNode;
  control?: (ids: { heading: string; hint: string }) => ReactNode;
  children?: ReactNode;
}) {
  const heading = useId();
  const line = useId();
  return (
    <div className="setrow">
      <div className="setrow__text">
        {title && (
          <h2 id={heading}>
            {title}
            {tag && <span className="tag">{tag}</span>}
          </h2>
        )}
        {hint && <p id={line}>{hint}</p>}
      </div>
      {control && <div className="setrow__control">{control({ heading, hint: line })}</div>}
      {children}
    </div>
  );
}
