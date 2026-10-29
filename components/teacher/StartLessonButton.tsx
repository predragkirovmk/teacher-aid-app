"use client";

import { PlayIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { useOpenSession } from "@/lib/teacher/api/hooks";
import { useT } from "@/lib/teacher/i18n";
import { StartDialog, type StartLesson } from "./StartDialog";

/**
 * "Започни час", the same on Today and on a lesson's own screen. It is the main action of its screen (`primary`) only while
 * no lesson is running, and the yellow of a screen is never shared: with a lesson running the yellow button is the one that
 * goes back to it.
 */
export function StartLessonButton({ lesson, primary = false, describedBy }: { lesson: StartLesson; primary?: boolean; describedBy?: string }) {
  const { t } = useT();
  const running = useOpenSession().data?.session != null;
  const [asking, setAsking] = useState(false);
  return (
    <>
      <button
        type="button"
        className={primary && !running ? "btn btn--primary" : "btn btn--secondary"}
        aria-haspopup="dialog"
        aria-describedby={describedBy}
        onClick={() => setAsking(true)}
      >
        <PlayIcon size={24} weight="fill" aria-hidden="true" />
        {t("lesson.start")}
      </button>
      {asking && <StartDialog lesson={lesson} onClose={() => setAsking(false)} />}
    </>
  );
}
