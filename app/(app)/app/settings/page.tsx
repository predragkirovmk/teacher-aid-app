"use client";

import { Languages, QrCode, RotateCcw } from "lucide-react";
import { Row } from "@/components/app/Row";
import { Top } from "@/components/app/Top";
import { useUI } from "@/components/app/ui";
import { useT } from "@/lib/app/i18n";
import { actions, useApp } from "@/lib/app/store";

export default function SettingsPage() {
  const { t, locale } = useT();
  const { openLang, toast, confirm } = useUI();
  const { notificationsOn } = useApp();

  return (
    <main className="screen">
      <Top title={t("settings.title")} />
      <div className="list">
        <Row icon={Languages} label={t("settings.language")} value={t("profile.langValue")} onClick={openLang} />

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
            onClick={() => actions.setNotificationsOn(!notificationsOn)}
          />
        </div>
      </div>

      <h2 className="section-h">{t("settings.demo")}</h2>
      <div className="list">
        <button
          className="item"
          onClick={() =>
            confirm({
              title: t("confirm.reset"),
              confirmLabel: t("settings.reset"),
              onConfirm: () => {
                actions.reset();
                actions.setLocale(locale);
                toast(t("settings.reset"));
              },
            })
          }
        >
          <span className="item__icon">
            <RotateCcw size={22} strokeWidth={2} aria-hidden="true" />
          </span>
          <span className="grow">
            <span className="item__title" style={{ display: "block" }}>
              {t("settings.reset")}
            </span>
            <span className="t-cap">{t("settings.resetHint")}</span>
          </span>
        </button>
        <Row icon={QrCode} label={t("scan.kit")} href="/app/qr-kit" />
      </div>
      <p className="t-cap" style={{ textAlign: "center", marginTop: 26 }}>
        {t("settings.about")}
      </p>
    </main>
  );
}
