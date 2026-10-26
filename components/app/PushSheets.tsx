"use client";

import { BellSimpleIcon, CheckIcon, ExportIcon, GearSixIcon, PlusSquareIcon, type Icon } from "@phosphor-icons/react";
import { useState } from "react";
import { useUI } from "@/components/app/ui";
import { useT, type Key } from "@/lib/app/i18n";
import type { TurnOnResult } from "@/lib/app/push/flow";
import { platformOf, readEnv } from "@/lib/app/push/support";

/** One numbered step of a sheet: the icon is what the student looks for on their own screen. */
export function Step({ icon: Icon, text }: { icon: Icon; text: string }) {
  return (
    <li>
      <span className="item__icon">
        <Icon size={22} aria-hidden="true" />
      </span>
      {text}
    </li>
  );
}

/** The steps to add the app to an iPhone's Home Screen; the same everywhere it is asked for. */
export function IosInstallSteps() {
  const { t } = useT();
  return (
    <>
      <ol className="steps">
        <Step icon={ExportIcon} text={t("install.ios.share")} />
        <Step icon={PlusSquareIcon} text={t("install.ios.add")} />
        <Step icon={CheckIcon} text={t("install.ios.confirm")} />
      </ol>
      <p className="t-cap steps__note">{t("install.ios.safari")}</p>
    </>
  );
}

/**
 * The soft ask, shown once after a moment worth telling the student about. It says what they will hear about and that they
 * can stop it; "Not now" is as easy to press as the yes. On an iPhone that is not on the Home Screen yet it says how to get
 * there instead, since the browser's own prompt cannot appear before that.
 */
export function PushAskSheet({
  kind,
  close,
  turnOn,
}: {
  kind: "turn-on" | "install";
  close: () => void;
  turnOn: () => Promise<TurnOnResult>;
}) {
  const { t } = useT();
  const { toast } = useUI();
  const [busy, setBusy] = useState(false);

  if (kind === "install") {
    return (
      <>
        <p className="sheet__title">{t("push.ask.title")}</p>
        <p className="t-body steps__note">{t("push.ask.ios.body")}</p>
        <IosInstallSteps />
        <button className="btn btn--primary btn--block" onClick={close}>
          {t("install.ok")}
        </button>
      </>
    );
  }

  return (
    <>
      <p className="sheet__title">{t("push.ask.title")}</p>
      <p className="t-body steps__note">{t("push.ask.body")}</p>
      <button
        className="btn btn--primary btn--block"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const outcome = await turnOn();
          close();
          const said = turnOnMessage(outcome);
          if (said) toast(t(said));
        }}
      >
        {t("push.ask.cta")}
      </button>
      <button className="btn btn--plain btn--block" onClick={close}>
        {t("push.ask.later")}
      </button>
    </>
  );
}

/** What to tell the student about how turning notifications on went; nothing when the browser's prompt was only closed. */
export function turnOnMessage(outcome: TurnOnResult): Key | null {
  switch (outcome.result) {
    case "on":
      return "push.on";
    case "denied":
      return "push.denied";
    case "failed":
      return "push.failed";
    default:
      return null;
  }
}

const HELP: Record<"ios" | "android" | "desktop", [Icon, Key][]> = {
  ios: [
    [GearSixIcon, "push.help.ios.1"],
    [BellSimpleIcon, "push.help.ios.2"],
    [CheckIcon, "push.help.ios.3"],
  ],
  android: [
    [GearSixIcon, "push.help.android.1"],
    [BellSimpleIcon, "push.help.android.2"],
    [CheckIcon, "push.help.android.3"],
  ],
  desktop: [
    [GearSixIcon, "push.help.desktop.1"],
    [BellSimpleIcon, "push.help.desktop.2"],
    [CheckIcon, "push.help.desktop.3"],
  ],
};

/** The browser has blocked notifications, which only the student can undo, in the phone's own settings: the steps for their kind of phone. */
export function PushHelpSheet({ close }: { close: () => void }) {
  const { t } = useT();
  const steps = HELP[platformOf(readEnv())];
  return (
    <>
      <p className="sheet__title">{t("push.help.title")}</p>
      <ol className="steps">
        {steps.map(([icon, key]) => (
          <Step key={key} icon={icon} text={t(key)} />
        ))}
      </ol>
      <p className="t-cap steps__note">{t("push.help.note")}</p>
      <button className="btn btn--primary btn--block" onClick={close}>
        {t("install.ok")}
      </button>
    </>
  );
}
