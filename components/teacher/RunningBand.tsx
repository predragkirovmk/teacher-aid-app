"use client";

import { ArrowUUpLeftIcon, BroadcastIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { useId } from "react";
import type { OpenSession } from "@/lib/teacher/api/types";
import { useRunningNow } from "@/lib/teacher/day";
import { useT } from "@/lib/teacher/i18n";
import { liveUrl } from "@/lib/teacher/routes";
import { courseLabel } from "@/lib/teacher/start";
import { runningFor, sayWhen, type Running } from "@/lib/teacher/when";

/** How long the lesson has been going, said as a person would. */
export function useRunningWords(session: NonNullable<OpenSession["session"]>, serverNow: string): string {
  const { t } = useT();
  const started = Date.parse(session.started_at);
  const now = useRunningNow(serverNow, session.started_at);
  const running: Running = runningFor(started, now ?? started);
  switch (running.kind) {
    case "now":
      return t("running.now");
    case "minutes":
      return running.n === 1 ? t("running.min1") : t("running.min", { n: running.n });
    case "time":
      return t("running.since.time", { time: running.time });
    case "when":
      return t("running.since.when", { when: sayWhen(t, running.when) });
  }
}

/**
 * A lesson is running: said at the top of Today, with what it is and for how long, and the screen's one yellow button, which
 * goes back to it. The yellow edge is the live lesson's colour; the word and the icon say it too.
 */
export function RunningBand({ session, serverNow }: { session: NonNullable<OpenSession["session"]>; serverNow: string }) {
  const { t } = useT();
  const tag = useId();
  const how = useRunningWords(session, serverNow);
  return (
    <section className="band" aria-labelledby={tag}>
      <div className="band__text">
        <p className="band__tag" id={tag}>
          <BroadcastIcon size={28} weight="fill" aria-hidden="true" />
          {t("running.tag")}
        </p>
        <h2 className="band__course">{courseLabel(session.subject_name, session.class_name)}</h2>
        <p className="band__line">
          {session.lesson.title}
          <span aria-hidden="true"> · </span>
          <span className="sr">. </span>
          {how}
        </p>
      </div>
      <Link href={liveUrl(session.id)} className="btn btn--primary">
        <ArrowUUpLeftIcon size={24} weight="bold" aria-hidden="true" />
        {t("running.back")}
      </Link>
    </section>
  );
}
