"use client";

import { ArrowCounterClockwiseIcon, BroadcastIcon, CheckCircleIcon } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { demo } from "@/lib/teacher/api/client";
import { useOpenSession } from "@/lib/teacher/api/hooks";
import { useT, type Key } from "@/lib/teacher/i18n";
import { ConfirmDialog } from "./ConfirmDialog";

/**
 * Start the demo school over, and show a lesson that is running (and close it again, since ending a lesson is not built
 * yet), so Today can be seen both ways. It only touches the demo's own data; it is not a warning, so it is not red. Nothing
 * shows on a live build, where there is no demo.
 */
export function DemoCard() {
  const { t } = useT();
  const [asking, setAsking] = useState(false);
  const [done, setDone] = useState<Key | null>(null);
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
            setDone(null);
            setAsking(true);
          }}
        >
          {t("demo.reset")}
        </button>
        <DemoRun onDone={setDone} />
        {done && (
          <p ref={status} className="status" role="status" tabIndex={-1}>
            <CheckCircleIcon size={28} weight="fill" aria-hidden="true" />
            {t(done)}
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
          setDone("demo.done");
        }}
      />
    </>
  );
}

/**
 * One button that shows a lesson that is running, for trying Today with one. It has no button to close it: a lesson is closed by End, from its page,
 * the band on Today or the reminder on any page, the same as a real one.
 */
function DemoRun({ onDone }: { onDone: (message: Key) => void }) {
  const { t } = useT();
  const running = useOpenSession().data?.session != null;
  return (
    <div className="demo__run">
      <p>{t(running ? "demo.run.running" : "demo.run.hint")}</p>
      {!running && (
        <button
          type="button"
          className="btn btn--secondary"
          onClick={() => {
            demo?.simulateRunning();
            onDone("demo.run.done");
          }}
        >
          <BroadcastIcon size={24} aria-hidden="true" />
          {t("demo.run")}
        </button>
      )}
    </div>
  );
}
