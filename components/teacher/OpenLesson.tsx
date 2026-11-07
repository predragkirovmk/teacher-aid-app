"use client";

import { ArrowUUpLeftIcon, BroadcastIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { useId } from "react";
import type { OpenSession } from "@/lib/teacher/api/types";
import { useT } from "@/lib/teacher/i18n";
import { liveUrl } from "@/lib/teacher/routes";
import { EndLesson } from "./EndLesson";

/**
 * A lesson is running, said in the frame of every page that does not say it already (Today has its band): the icon, "Час во
 * тек" and the class, and the way back, in one press. It sits in the sidebar on a laptop and in the top bar where the sidebar
 * is a drawer; the shell draws both and the stylesheet shows one. It is never yellow, because the yellow of a screen belongs
 * to one button and several pages already have it; a white edge, the icon and the words make it stand out from the menu. It
 * does not move.
 */
export function OpenLesson({ session, where }: { session: NonNullable<OpenSession["session"]>; where: "side" | "top" }) {
  const { t } = useT();
  const tag = useId();
  return (
    <div className={`running running--${where}`} role="group" aria-labelledby={tag}>
      <p className="running__tag" id={tag}>
        <BroadcastIcon size={24} weight="fill" aria-hidden="true" />
        <span>
          {t("running.tag")}
          <span aria-hidden="true"> · </span>
          <span className="sr">, </span>
          <span className="nowrap">{session.class_name}</span>
        </span>
      </p>
      {/* The words on the button are the short ones; the name a screen reader gives says which lesson, and starts with them. */}
      <div className="running__actions">
        <Link
          href={liveUrl(session.id)}
          prefetch={false}
          className="btn btn--secondary btn--small running__back"
          aria-label={t("running.here.name", { class: session.class_name })}
        >
          <ArrowUUpLeftIcon size={24} weight="bold" aria-hidden="true" />
          {t("running.here.back")}
        </Link>
        <EndLesson sessionId={session.id} size="small" goToEndPage short />
      </div>
    </div>
  );
}
