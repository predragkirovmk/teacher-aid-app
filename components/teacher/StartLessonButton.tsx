"use client";

import { PlayIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { useOpenSession } from "@/lib/teacher/api/hooks";
import { useT } from "@/lib/teacher/i18n";
import { StartDialog, type StartLesson } from "./StartDialog";

/**
 * "Започни час", the same on Today and on a lesson's own screen. It is the main action of its screen (`primary`) only while
 * no lesson is running, and the main button of a screen is never shared: with a lesson running it is the one that
 * goes back to it. In a row of a list it is the row's one button, quiet.
 */
export function StartButton({
  primary = false,
  describedBy,
  onPress,
}: {
  primary?: boolean;
  describedBy?: string;
  onPress: () => void;
}) {
  const { t } = useT();
  const running = useOpenSession().data?.session != null;
  return (
    <button
      type="button"
      className={primary && !running ? "btn btn--primary" : "btn btn--secondary"}
      aria-haspopup="dialog"
      aria-describedby={describedBy}
      onClick={onPress}
    >
      <PlayIcon size={24} weight="fill" aria-hidden="true" />
      {t("lesson.start")}
    </button>
  );
}

/** The button with its own window, for a screen about one lesson. Today keeps the window itself: a list changes under its buttons. */
export function StartLessonButton({ lesson, primary = false }: { lesson: StartLesson; primary?: boolean }) {
  const [asking, setAsking] = useState(false);
  return (
    <>
      <StartButton primary={primary} onPress={() => setAsking(true)} />
      {asking && <StartDialog lesson={lesson} onClose={() => setAsking(false)} />}
    </>
  );
}
