"use client";

import { ArrowUUpLeftIcon, BroadcastIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { useId } from "react";
import type { OpenSession } from "@/lib/teacher/api/types";
import { useRunningNow } from "@/lib/teacher/day";
import { isOne } from "@/lib/teacher/format";
import { useT } from "@/lib/teacher/i18n";
import { liveUrl } from "@/lib/teacher/routes";
import { runningFor, sayWhen, type Running } from "@/lib/teacher/when";
import { EndLesson } from "./EndLesson";

/** How long the lesson has been going, said as a person would. */
export function useRunningWords(session: NonNullable<OpenSession["session"]>, serverNow: string): string {
  const { t, locale } = useT();
  const started = Date.parse(session.started_at);
  const now = useRunningNow(serverNow, session.started_at);
  const running: Running = runningFor(started, now ?? started);
  switch (running.kind) {
    case "now":
      return t("running.now");
    case "minutes":
      return t(isOne(running.n, locale) ? "running.min1" : "running.min", { n: running.n });
    case "time":
      return t("running.since.time", { time: running.time });
    case "when":
      return t("running.since.when", { when: sayWhen(t, running.when) });
  }
}

/**
 * A lesson is running: said at the top of Today, with what it is and for how long, and the screen's one main button, which
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
        <h2 className="band__course">
          {session.subject_name}, <span className="nowrap">{session.class_name}</span>
        </h2>
        <p className="band__line">
          {session.lesson.title}
          {/* The dot stays with the title, so a line never starts with it; the space after it is where the line may break. */}
          <span aria-hidden="true">{"\u00a0·"}</span>{" "}
          <span className="sr">. </span>
          {/* How long stays in one piece: "Трае" at the end of a line and "12 минути" on the next is hard to read. */}
          <span className="keep">{how}</span>
        </p>
      </div>
      <div className="band__actions">
        <Link href={liveUrl(session.id)} prefetch={false} className="btn btn--primary">
          <ArrowUUpLeftIcon size={24} weight="bold" aria-hidden="true" />
          {t("running.back")}
        </Link>
        <EndLesson sessionId={session.id} goToEndPage />
      </div>
    </section>
  );
}
