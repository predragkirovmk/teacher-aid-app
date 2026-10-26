"use client";

import { ArrowCounterClockwiseIcon, BellRingingIcon, DevicesIcon, DownloadSimpleIcon, LockSimpleIcon, QrCodeIcon, TranslateIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { ClockOptions } from "@/components/app/ClockOptions";
import { turnOnMessage } from "@/components/app/PushSheets";
import { Row } from "@/components/app/Row";
import { Top } from "@/components/app/Top";
import { useUI } from "@/components/app/ui";
import { demoOnly } from "@/lib/app/api";
import { useSettings } from "@/lib/app/api/hooks";
import { resetDemo, signInElsewhere } from "@/lib/app/demo";
import { errorCopy, useT, type Key } from "@/lib/app/i18n";
import { useInstall } from "@/lib/app/install";
import { sendTestNotification, usePush } from "@/lib/app/push";

/** What the line under the switch says, for each state of it. */
const HINT: Record<ReturnType<typeof usePush>["status"], Key> = {
  checking: "settings.notificationsHint",
  on: "settings.push.on",
  off: "settings.push.off",
  blocked: "settings.push.blocked",
  "needs-install": "settings.push.install",
  unsupported: "settings.push.unsupported",
};

/** The build, short: enough to tell two deploys apart when checking that a phone has the latest. */
const VERSION = (process.env.NEXT_PUBLIC_APP_BUILD ?? "").replace(/^dpl_/, "").slice(0, 7);

export default function SettingsPage() {
  const { t } = useT();
  const { openLang, openInstall, openPushHelp, toast } = useUI();
  const install = useInstall();
  const push = usePush();
  // What the student asked for shows at once; it settles when the browser and the API have answered.
  const [pending, setPending] = useState<"on" | "off" | null>(null);
  const { status } = push;
  const checked = pending ? pending === "on" : status === "on";

  /** A tap on the switch does what the state allows: ask, turn off, or say what the phone needs first. */
  async function flip() {
    if (push.busy || status === "checking" || status === "unsupported") return;
    if (status === "blocked") return openPushHelp();
    if (status === "needs-install") return openInstall("ios", "push");
    try {
      if (status === "on") {
        setPending("off");
        await push.turnOff();
        toast(t("push.off"));
      } else {
        setPending("on");
        const said = turnOnMessage(await push.turnOn());
        if (said) toast(t(said));
      }
    } catch (e) {
      toast(errorCopy(t, e));
    } finally {
      setPending(null);
    }
  }

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
            <span className="t-cap" id="push-hint">
              {t(HINT[status === "on" && !checked ? "off" : checked && status !== "on" ? "on" : status])}
            </span>
          </span>
          <button
            className="switch"
            role="switch"
            aria-checked={checked}
            aria-disabled={status === "unsupported" || status === "checking"}
            aria-busy={push.busy}
            aria-label={t("settings.notifications")}
            aria-describedby="push-hint"
            onClick={flip}
          />
        </div>
        {/* What the phone itself has to do before the switch can work. */}
        {status === "blocked" && <Row icon={LockSimpleIcon} label={t("settings.push.helpRow")} onClick={openPushHelp} />}
        {status === "needs-install" && <Row icon={DownloadSimpleIcon} label={t("settings.push.installRow")} onClick={() => openInstall("ios", "push")} />}
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
  const { toast, confirm, openInstall, openPushHelp } = useUI();
  const { locale } = useSettings();
  return (
    <>
      <h2 className="section-h">{t("settings.demo")}</h2>
      <div className="list">
        <button
          className="item"
          onClick={async () => {
            const sent = await sendTestNotification(t, locale);
            if (sent === "sent") toast(t("settings.testPushSent"));
            else if (sent === "denied") openPushHelp();
            else if (sent === "needs-install") openInstall("ios", "push");
            else if (sent === "unsupported") toast(t("settings.push.unsupported"));
          }}
        >
          <span className="item__icon">
            <BellRingingIcon size={22} aria-hidden="true" />
          </span>
          <span className="grow">
            <span className="item__title" style={{ display: "block" }}>
              {t("settings.testPush")}
            </span>
            <span className="t-cap">{t("settings.testPushHint")}</span>
          </span>
        </button>
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
        <button className="item" onClick={signInElsewhere}>
          <span className="item__icon">
            <DevicesIcon size={22} aria-hidden="true" />
          </span>
          <span className="grow">
            <span className="item__title" style={{ display: "block" }}>
              {t("settings.simElsewhere")}
            </span>
            <span className="t-cap">{t("settings.simElsewhereHint")}</span>
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
