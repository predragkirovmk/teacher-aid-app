"use client";

import { ArrowCounterClockwiseIcon, CheckCircleIcon } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { demo } from "@/lib/teacher/api/client";
import { useT } from "@/lib/teacher/i18n";
import { ConfirmDialog } from "./ConfirmDialog";

/**
 * Start the demo school over. It only touches the demo's own data (the lessons made here); it is not a warning, so
 * it is not red. Nothing shows on a live build, where there is no demo.
 */
export function DemoCard() {
  const { t } = useT();
  const [asking, setAsking] = useState(false);
  const [done, setDone] = useState(false);
  const status = useRef<HTMLParagraphElement>(null);

  // A message that appears together with its live region is often not read out; moving the focus to it is.
  useEffect(() => {
    if (done) status.current?.focus();
  }, [done]);

  if (!demo) return null;

  // The question sits beside the card, not in it: the card's own paragraph rules would reach into the dialog.
  return (
    <>
      <div className="card card--stack">
        <span className="card__icon">
          <ArrowCounterClockwiseIcon size={32} aria-hidden="true" />
        </span>
        <h2>{t("demo.title")}</h2>
        <p>{t("demo.hint")}</p>
        <button
          type="button"
          className="btn btn--secondary"
          onClick={() => {
            setDone(false);
            setAsking(true);
          }}
        >
          {t("demo.reset")}
        </button>
        {done && (
          <p ref={status} className="status" role="status" tabIndex={-1}>
            <CheckCircleIcon size={28} weight="fill" aria-hidden="true" />
            {t("demo.done")}
          </p>
        )}
      </div>
      <ConfirmDialog
        open={asking}
        title={t("demo.confirm.title")}
        body={t("demo.confirm.body")}
        stay={t("demo.confirm.stay")}
        confirm={t("demo.confirm.yes")}
        onStay={() => setAsking(false)}
        onConfirm={() => {
          demo?.reset();
          setAsking(false);
          setDone(true);
        }}
      />
    </>
  );
}
