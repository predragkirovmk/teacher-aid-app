"use client";

import { CaretDownIcon, CheckCircleIcon, DownloadSimpleIcon } from "@phosphor-icons/react";
import { useId, useState } from "react";
import { promptInstall, useInstall } from "@/lib/app/install";
import { useT } from "@/lib/teacher/i18n";
import { SettingRow } from "./SettingRow";

/**
 * "Install on this computer". Where the browser offers its install dialog, one button opens it. Otherwise the plain steps for the
 * install icon in the address bar of Chrome and Edge wait behind "Како?": a real button that says in words whether they are shown, so
 * the row stays one line until a teacher asks. Nothing shows when the app already runs installed.
 */
export function InstallRow() {
  const { t } = useT();
  const mode = useInstall();
  const [done, setDone] = useState(false);
  const [open, setOpen] = useState(false);
  const steps = useId();

  if (done) {
    return (
      <div className="setrow" role="status">
        <p className="status">
          <CheckCircleIcon size={28} weight="fill" aria-hidden="true" />
          {t("install.done")}
        </p>
      </div>
    );
  }
  if (mode === "installed") return null;

  if (mode === "prompt") {
    return (
      <SettingRow
        title={t("install.title")}
        hint={t("install.hint")}
        control={() => (
          <button
            type="button"
            className="btn btn--secondary"
            onClick={async () => {
              if ((await promptInstall()) === "accepted") setDone(true);
            }}
          >
            <DownloadSimpleIcon size={24} aria-hidden="true" />
            {t("install.button")}
          </button>
        )}
      />
    );
  }

  return (
    <SettingRow
      title={t("install.title")}
      hint={t("install.hint")}
      control={() => (
        <button
          type="button"
          className="btn btn--secondary setrow__how"
          aria-expanded={open}
          aria-controls={steps}
          data-open={open}
          onClick={() => setOpen((was) => !was)}
        >
          <CaretDownIcon size={20} aria-hidden="true" />
          {t(open ? "install.how.hide" : "install.how")}
        </button>
      )}
    >
      <div id={steps} className="setrow__more" hidden={!open}>
        <p className="status">{t("install.steps")}</p>
        <ol className="steps">
          <li>{t("install.step1")}</li>
          <li>{t("install.step2")}</li>
          <li>{t("install.step3")}</li>
        </ol>
        <p>{t("install.nothing")}</p>
      </div>
    </SettingRow>
  );
}
