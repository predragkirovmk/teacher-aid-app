"use client";

import { useEffect, useId, useRef } from "react";
import { Problem } from "./Problem";

/**
 * A question before something that cannot be undone, in plain words, with the safe answer in hand: it is the yellow
 * button and it has the focus. The safe button comes first in the markup because that is the one `showModal()` focuses
 * (a closed dialog cannot take an `autoFocus`). Escape and the backdrop-less close both answer "stay".
 */
export function ConfirmDialog({
  open,
  title,
  body,
  problem,
  stay,
  confirm,
  onStay,
  onConfirm,
}: {
  open: boolean;
  title: string;
  body?: string;
  /** Why the last "yes" did not go through. The question stays open and says so; it is read out when it appears. */
  problem?: string;
  stay: string;
  confirm: string;
  onStay: () => void;
  onConfirm: () => void | Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useId();
  const description = useId();

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    else if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={dialog}
      className="dialog"
      role="alertdialog"
      aria-labelledby={heading}
      aria-describedby={body ? description : undefined}
      onClose={onStay}
    >
      <h2 id={heading} className="dialog__title">
        {title}
      </h2>
      {body && (
        <p id={description} className="dialog__body">
          {body}
        </p>
      )}
      {problem && <Problem>{problem}</Problem>}
      <div className="dialog__actions">
        <button type="button" className="btn btn--primary" onClick={onStay}>
          {stay}
        </button>
        <button type="button" className="btn btn--secondary" onClick={onConfirm}>
          {confirm}
        </button>
      </div>
    </dialog>
  );
}
