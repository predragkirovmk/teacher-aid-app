"use client";

import { CheckCircleIcon, DesktopIcon, DownloadSimpleIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { promptInstall, useInstall } from "@/lib/app/install";
import { useT } from "@/lib/teacher/i18n";

/**
 * "Install on this computer". Where the browser offers its install dialog, one button opens it;
 * otherwise plain steps for the install icon in the address bar of Chrome and Edge. Nothing shows
 * when the app already runs installed.
 */
export function InstallCard() {
  const { t } = useT();
  const mode = useInstall();
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <div className="card" role="status">
        <p className="status">
          <CheckCircleIcon size={28} weight="fill" aria-hidden="true" />
          {t("install.done")}
        </p>
      </div>
    );
  }
  if (mode === "installed") return null;

  return (
    <div className="card card--stack">
      <span className="card__icon">
        <DesktopIcon size={32} aria-hidden="true" />
      </span>
      <h2>{t("install.title")}</h2>
      <p>{t("install.hint")}</p>
      {mode === "prompt" ? (
        <button
          type="button"
          className="btn btn--primary"
          onClick={async () => {
            if ((await promptInstall()) === "accepted") setDone(true);
          }}
        >
          <DownloadSimpleIcon size={24} weight="bold" aria-hidden="true" />
          {t("install.button")}
        </button>
      ) : (
        <>
          <p className="status">{t("install.steps")}</p>
          <ol className="steps">
            <li>{t("install.step1")}</li>
            <li>{t("install.step2")}</li>
            <li>{t("install.step3")}</li>
          </ol>
          <p className="note">{t("install.nothing")}</p>
        </>
      )}
    </div>
  );
}
