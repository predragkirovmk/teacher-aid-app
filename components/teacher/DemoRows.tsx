"use client";

import { BroadcastIcon, CheckCircleIcon } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { demo } from "@/lib/teacher/api/client";
import { useOpenSession } from "@/lib/teacher/api/hooks";
import { useT, type Key } from "@/lib/teacher/i18n";
import { ConfirmDialog } from "./ConfirmDialog";
import { SettingRow } from "./SettingRow";

/**
 * The demo's own group of Settings: start the demo school over, and show a lesson that is running, so Today can be seen both ways.
 * It only touches the demo's own data; it is not a warning, so it is not red. Nothing shows on a live build, where there is no demo.
 */
export function DemoRows() {
  const { t } = useT();
  const [asking, setAsking] = useState(false);
  const [done, setDone] = useState<Key | null>(null);
  const status = useRef<HTMLParagraphElement>(null);
  const running = useOpenSession().data?.session != null;

  // A message that appears together with its live region is often not read out; moving the focus to it is.
  useEffect(() => {
    if (done) status.current?.focus();
  }, [done]);

  if (!demo) return null;

  // The question sits beside the group, not in it: the group's own paragraph rules would reach into the dialog.
  return (
    <>
      <div className="setgroup">
        <SettingRow
          title={t("demo.title")}
          hint={t("demo.hint")}
          control={() => (
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
          )}
        />
        {/* A lesson that is running has no button to close it here: a lesson is closed by End, from its page, the band on Today or
            the reminder on any page, the same as a real one. */}
        <SettingRow
          hint={t(running ? "demo.run.running" : "demo.run.hint")}
          control={
            running
              ? undefined
              : () => (
                  <button
                    type="button"
                    className="btn btn--secondary"
                    onClick={() => {
                      demo?.simulateRunning();
                      setDone("demo.run.done");
                    }}
                  >
                    <BroadcastIcon size={24} aria-hidden="true" />
                    {t("demo.run")}
                  </button>
                )
          }
        />
        {done && (
          <div className="setrow">
            <p ref={status} className="status" role="status" tabIndex={-1}>
              <CheckCircleIcon size={28} weight="fill" aria-hidden="true" />
              {t(done)}
            </p>
          </div>
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
