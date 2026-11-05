"use client";

import { ProjectorScreenIcon, WarningIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { useState } from "react";
import { useT } from "@/lib/teacher/i18n";
import { classViewUrl, PROJECTOR_HELP } from "@/lib/teacher/routes";
import { openProjector, useClassViewStatus } from "@/lib/teacher/windows";

/**
 * The projected window, opened with one click, in a window of its own and under a fixed name, so a second press brings back the same one.
 * The console knows whether it is open (the two windows beat to each other) and says so, with "Отвори повторно" when it has been closed. A
 * browser that stops the new window is told in words, with a plain link that opens it in a new window. Under it, the one warning that
 * matters: the projector must show only that window, because this screen has names (EC-SES-05), with the way to set it up.
 */
export function ProjectorControl({ sessionId }: { sessionId: string }) {
  const { t } = useT();
  const status = useClassViewStatus(sessionId);
  const [blocked, setBlocked] = useState(false);
  const closed = status === "closed";

  const open = () => setBlocked(openProjector(sessionId) === "blocked");

  return (
    <div className="card projector">
      <button type="button" className="btn btn--secondary" onClick={open}>
        <ProjectorScreenIcon size={24} aria-hidden="true" />
        {closed ? t("live.projector.again") : t("live.projector.open")}
      </button>
      {/* A line that says where the window stands, and is read out when it changes. A window never opened has nothing to say, and keeps its room. */}
      <p className="projector__status" role="status" data-status={status}>
        {status === "open" && t("live.projector.open.status")}
        {status === "closed" && t("live.projector.closed")}
        {status === "checking" && t("live.projector.checking")}
      </p>
      {blocked && (
        <div className="callout" role="alert">
          <WarningIcon size={28} weight="fill" aria-hidden="true" />
          <div>
            <p className="callout__title">{t("live.projector.blocked.title")}</p>
            <p>{t("live.projector.blocked.body")}</p>
            <a href={classViewUrl(sessionId)} target="_blank" rel="noopener" className="callout__link">
              {t("live.projector.blocked.link")}
            </a>
          </div>
        </div>
      )}
      <p className="projector__hint">{t("live.projector.hint")}</p>
      <div className="callout">
        <WarningIcon size={28} weight="fill" aria-hidden="true" />
        <div>
          <p>{t("live.mirror.warn")}</p>
          <Link href={PROJECTOR_HELP} className="callout__link">
            {t("live.mirror.link")}
          </Link>
        </div>
      </div>
    </div>
  );
}
