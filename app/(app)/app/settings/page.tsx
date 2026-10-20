"use client";

import { ArrowCounterClockwiseIcon, QrCodeIcon, TranslateIcon } from "@phosphor-icons/react";
import { ClockOptions } from "@/components/app/ClockOptions";
import { Row } from "@/components/app/Row";
import { Top } from "@/components/app/Top";
import { useUI } from "@/components/app/ui";
import { demoOnly } from "@/lib/app/api";
import { useSettings } from "@/lib/app/api/hooks";
import { resetDemo } from "@/lib/app/demo";
import { errorCopy, useT } from "@/lib/app/i18n";
import { useInstall } from "@/lib/app/install";

/** The build, short: enough to tell two deploys apart when checking that a phone has the latest. */
const VERSION = (process.env.NEXT_PUBLIC_APP_BUILD ?? "").replace(/^dpl_/, "").slice(0, 7);

export default function SettingsPage() {
  const { t } = useT();
  const { openLang, toast } = useUI();
  const { notificationsOn, setNotificationsOn } = useSettings();
  const install = useInstall();

  return (
    <main className="screen">
      <Top title={t("settings.title")} />
      <div className="list">
        <Row icon={TranslateIcon} label={t("settings.language")} value={t("profile.langValue")} onClick={openLang} />

        <div className="item">
          <span className="grow">
            <span className="item__title" style={{ display: "block" }}>
              {t("settings.notifications")}
            </span>
            <span className="t-cap">{t("settings.notificationsHint")}</span>
          </span>
          <button
            className="switch"
            role="switch"
            aria-checked={notificationsOn}
            aria-label={t("settings.notifications")}
            onClick={() => setNotificationsOn(!notificationsOn).catch((e) => toast(errorCopy(t, e)))}
          />
        </div>
      </div>

      {demoOnly && <DemoSection />}
      <p className="t-cap" style={{ textAlign: "center", marginTop: demoOnly ? 4 : 24 }}>
        {t(install === "installed" ? "settings.installed" : "settings.inBrowser")} · {t("settings.version", { v: VERSION })}
      </p>
    </main>
  );
}

/** What only the demo has: resetting its data, the test QR codes and the demo clock. */
function DemoSection() {
  const { t } = useT();
  const { toast, confirm } = useUI();
  return (
    <>
      <h2 className="section-h">{t("settings.demo")}</h2>
      <div className="list">
        <button
          className="item"
          onClick={() =>
            confirm({
              title: t("confirm.reset"),
              confirmLabel: t("settings.reset"),
              onConfirm: () => {
                resetDemo();
                toast(t("settings.resetDone"));
              },
            })
          }
        >
          <span className="item__icon">
            <ArrowCounterClockwiseIcon size={22} aria-hidden="true" />
          </span>
          <span className="grow">
            <span className="item__title" style={{ display: "block" }}>
              {t("settings.reset")}
            </span>
            <span className="t-cap">{t("settings.resetHint")}</span>
          </span>
        </button>
        <Row icon={QrCodeIcon} label={t("scan.kit")} href="/app/qr-kit" />
      </div>

      {/* For a walkthrough: Home before, during and after school, whatever the real time is. */}
      <h2 className="section-h">{t("settings.clock")}</h2>
      <ClockOptions />
      <p className="t-cap" style={{ margin: "8px 4px 0" }}>
        {t("settings.clockHint")}
      </p>
      <p className="t-cap" style={{ textAlign: "center", marginTop: 24 }}>
        {t("settings.about")}
      </p>
    </>
  );
}
