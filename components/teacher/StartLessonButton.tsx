"use client";

import { ArrowUUpLeftIcon, PlayIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { startSession, useOpenSession } from "@/lib/teacher/api/hooks";
import type { Id } from "@/lib/teacher/api/types";
import { useT } from "@/lib/teacher/i18n";
import { liveUrl } from "@/lib/teacher/routes";
import { startNotice, type StartNotice } from "@/lib/teacher/start";

/**
 * "Започни час", the same in a list and on a lesson's own screen: one press creates the session and goes straight to the console's
 * waiting step. While it waits the button is busy. It is the main action of its screen (`primary`) only while no lesson is running, and
 * the main button of a screen is never shared: with a lesson running it is the one that goes back to it. A teacher who already has a lesson
 * running is told so, with the way back to it, whether this screen knew or only the API did (`session_open`); any other failure is said
 * in the same small window.
 */
export function StartLessonButton({ lesson, primary = false, describedBy }: { lesson: { id: Id }; primary?: boolean; describedBy?: string }) {
  const { t } = useT();
  const router = useRouter();
  const open = useOpenSession();
  const running = open.data?.session ?? null;
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: StartNotice; error: unknown } | null>(null);

  const start = async () => {
    if (busy) return;
    if (running) {
      setNotice({ kind: "running", error: null });
      return;
    }
    setBusy(true);
    try {
      const snapshot = await startSession({ lesson_id: lesson.id });
      router.push(liveUrl(snapshot.session.id));
    } catch (e) {
      setNotice({ kind: startNotice(e), error: e });
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className={primary && !running ? "btn btn--primary" : "btn btn--secondary"}
        aria-busy={busy}
        aria-describedby={describedBy}
        disabled={busy}
        onClick={() => void start()}
      >
        <PlayIcon size={24} weight="fill" aria-hidden="true" />
        {t("lesson.start")}
      </button>
      {notice && <StartNoticeDialog notice={notice} onClose={() => setNotice(null)} />}
    </>
  );
}

/** The window for a start that did not go through. It is on screen only while it is wanted, so it opens as a modal the moment it mounts. */
function StartNoticeDialog({ notice, onClose }: { notice: { kind: StartNotice; error: unknown }; onClose: () => void }) {
  const { t, te } = useT();
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useId();
  const body = useId();
  const running = useOpenSession().data?.session ?? null;
  const isRunning = notice.kind === "running" && running !== null;
  // The API said a lesson is open but the open lesson is not known yet (it is being read again): wait for it rather than say "failed".
  const waiting = notice.kind === "running" && !isRunning;

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (!d.open) d.showModal();
    d.querySelector<HTMLElement>("[data-first]")?.focus();
  }, [waiting]);

  if (waiting) return null;
  return (
    <dialog ref={dialog} className="dialog" role="alertdialog" aria-labelledby={heading} aria-describedby={body} onClose={onClose}>
      <h2 id={heading} className="dialog__title">
        {t(isRunning ? "start.running.title" : "start.failed")}
      </h2>
      <p id={body} className="dialog__body">
        {isRunning ? t("start.running.body", { title: running.lesson.title }) : te(notice.error)}
      </p>
      <div className="dialog__actions">
        {isRunning && (
          <Link href={liveUrl(running.id)} prefetch={false} className="btn btn--primary" data-first>
            <ArrowUUpLeftIcon size={24} weight="bold" aria-hidden="true" />
            {t("running.back")}
          </Link>
        )}
        <button type="button" className="btn btn--secondary" data-first={isRunning ? undefined : ""} onClick={() => dialog.current?.close()}>
          {t("close")}
        </button>
      </div>
    </dialog>
  );
}
