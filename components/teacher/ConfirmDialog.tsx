"use client";

import { useEffect, useId, useRef } from "react";

/**
 * A question before something that cannot be undone, in plain words, with the safe answer in hand: it is the yellow
 * button and it has the focus. Escape and the backdrop-less close both answer "stay".
 */
export function ConfirmDialog({
  open,
  title,
  body,
  stay,
  confirm,
  onStay,
  onConfirm,
}: {
  open: boolean;
  title: string;
  body?: string;
  stay: string;
  confirm: string;
  onStay: () => void;
  onConfirm: () => void;
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
      <div className="dialog__actions">
        <button type="button" className="btn btn--primary" autoFocus onClick={onStay}>
          {stay}
        </button>
        <button type="button" className="btn btn--secondary" onClick={onConfirm}>
          {confirm}
        </button>
      </div>
    </dialog>
  );
}
