"use client";

import { StopCircleIcon } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { endLesson } from "@/lib/teacher/api/hooks";
import type { Id } from "@/lib/teacher/api/types";
import { useT } from "@/lib/teacher/i18n";
import { liveUrl } from "@/lib/teacher/routes";
import { ConfirmDialog } from "./ConfirmDialog";

/**
 * The one red control of the app (FR-END-04): "Заврши го часот", on the console in every state and on the band and the reminder of every other page.
 * It always asks first, in plain words, with the safe answer as the default. If the call fails the question stays open and says so, and pressing
 * "Да" again tries again; the lesson is untouched. A lesson another window already ended is as good as ended. From another page it leads to the end page.
 * It is red words and a stop icon in a red edge, never a red block, so the main button of a screen stays the one that leads.
 */
export function EndLesson({
  sessionId,
  size = "normal",
  goToEndPage = false,
  short = false,
}: {
  sessionId: Id;
  size?: "normal" | "small";
  goToEndPage?: boolean;
  /** The reminder in the frame is narrow: it says "Заврши" and its name for a screen reader is the whole phrase, which contains the visible word. */
  short?: boolean;
}) {
  const { t, te } = useT();
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const end = async () => {
    setProblem(null);
    try {
      await endLesson(sessionId);
      setAsking(false);
      if (goToEndPage) router.push(liveUrl(sessionId));
    } catch (e) {
      setProblem(`${t("end.failed")} ${te(e)}`);
    }
  };

  return (
    <>
      <button
        type="button"
        className={size === "small" ? "btn btn--danger btn--small" : "btn btn--danger"}
        aria-haspopup="dialog"
        aria-label={short ? t("end.button") : undefined}
        onClick={() => setAsking(true)}
      >
        <StopCircleIcon size={24} weight="fill" aria-hidden="true" />
        {short ? t("end.short") : t("end.button")}
      </button>
      <ConfirmDialog
        open={asking}
        title={t("end.q.title")}
        body={t("end.q.body")}
        problem={problem ?? undefined}
        stay={t("end.q.stay")}
        confirm={t("end.q.yes")}
        onStay={() => {
          setAsking(false);
          setProblem(null);
        }}
        onConfirm={end}
      />
    </>
  );
}
