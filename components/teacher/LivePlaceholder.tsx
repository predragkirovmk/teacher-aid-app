"use client";

import { BroadcastIcon, MagnifyingGlassIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useOpenSession } from "@/lib/teacher/api/hooks";
import type { OpenSession } from "@/lib/teacher/api/types";
import { useT } from "@/lib/teacher/i18n";
import { courseLabel } from "@/lib/teacher/start";
import { TODAY } from "@/lib/teacher/signin";
import { LoadProblem } from "./LoadProblem";
import { PageHeader } from "./PageHeader";
import { useRunningWords } from "./RunningBand";
import { Bar, Loading } from "./Skeleton";

/**
 * Where a started lesson lands until step 7 builds the console: it says the live lesson is coming, and which lesson this is.
 * An address that is not the open lesson (it ended, or the link is old) says so and leads back to Today.
 */
export function LivePlaceholder() {
  const { t } = useT();
  const { sessionId } = useParams<{ sessionId: string }>();
  const open = useOpenSession();
  const session = open.data?.session && open.data.session.id === sessionId ? open.data.session : null;
  const settled = open.status === "ready";

  return (
    <>
      <PageHeader title={t("live.title")} back={TODAY} backLabel={t("back.today")} />
      <div className="content">
        {open.status === "loading" && (
          <Loading>
            <div className="card card--stack" aria-hidden="true">
              <Bar width="4rem" height="4rem" className="skeleton--round" />
              <Bar width="60%" height="2rem" />
              <Bar width="90%" height="1.5rem" />
            </div>
          </Loading>
        )}
        {open.status === "error" && <LoadProblem title={t("running.error.title")} error={open.error} onRetry={open.refetch} />}
        {session && open.data && <Soon session={session} serverNow={open.data.server_now} />}
        {settled && !session && (
          <div className="card card--stack">
            <span className="card__icon">
              <MagnifyingGlassIcon size={32} aria-hidden="true" />
            </span>
            <h2>{t("live.notopen.title")}</h2>
            <p>{t("live.notopen.body")}</p>
            <Link href={TODAY} className="btn btn--primary">
              {t("notfound.cta")}
            </Link>
          </div>
        )}
      </div>
    </>
  );
}

function Soon({ session, serverNow }: { session: NonNullable<OpenSession["session"]>; serverNow: string }) {
  const { t } = useT();
  const how = useRunningWords(session, serverNow);
  return (
    <div className="card card--stack">
      <span className="card__icon">
        <BroadcastIcon size={32} aria-hidden="true" />
      </span>
      <h2>{t("live.soon.title")}</h2>
      <p>
        {courseLabel(session.subject_name, session.class_name)}: {session.lesson.title}. {how}.
      </p>
      <p>{t("live.soon.body")}</p>
    </div>
  );
}
