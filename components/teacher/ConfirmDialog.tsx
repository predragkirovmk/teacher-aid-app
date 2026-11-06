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
  // A second press of "yes" while the first is still being answered would do the thing twice (the second delete finds nothing to delete
  // and says so over the first's success), so it is ignored until the first has finished.
  const answering = useRef(false);
  const yes = async () => {
    if (answering.current) return;
    answering.current = true;
    try {
      await onConfirm();
    } finally {
      answering.current = false;
    }
  };

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
      // Escape asks to close (`cancel`) a task before the dialog has closed (`close`). "Stay" is answered at the first, so the caller's state is in step at once and a
      // key that opens the question again straight after is a real change; the late `close` on a busy computer is about the dialog that was, and counts only while shut.
      onCancel={onStay}
      onClose={(e) => {
        if (!e.currentTarget.open) onStay();
      }}
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
        <button type="button" className="btn btn--secondary" onClick={() => void yes()}>
          {confirm}
        </button>
      </div>
    </dialog>
  );
}
