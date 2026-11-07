import { ExclamationMarkIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";

/**
 * Something did not work, said where the teacher is looking: a red badge with a white mark, then what went wrong in a
 * line of its own (when there is one) and what to do about it. The badge is the red, the mark and the words are the
 * meaning, so nothing depends on seeing the colour. Read out when it appears.
 */
export function Problem({ title, children, id }: { title?: string; children: ReactNode; id?: string }) {
  return (
    <div className="problem" role="alert" id={id}>
      <span className="problem__badge" aria-hidden="true">
        <ExclamationMarkIcon size={24} weight="bold" />
      </span>
      <div>
        {title && <p className="problem__title">{title}</p>}
        <p className="problem__body">{children}</p>
      </div>
    </div>
  );
}
