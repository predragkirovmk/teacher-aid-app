"use client";

import { ChevronRight, Languages, RotateCcw } from "lucide-react";
import { Top } from "@/components/app/Top";
import { useUI } from "@/components/app/ui";
import { useT } from "@/lib/app/i18n";
import { actions, useApp } from "@/lib/app/store";

export default function SettingsPage() {
  const { t, locale } = useT();
  const { openLang, toast } = useUI();
  const { notificationsOn } = useApp();

  return (
    <main className="screen">
      <Top title={t("settings.title")} />
      <div className="list">
        <button className="item" onClick={openLang}>
          <span className="item__icon">
            <Languages size={22} strokeWidth={2} />
          </span>
          <span className="grow item__title">{t("settings.language")}</span>
          <span className="t-cap">{t("profile.langValue")}</span>
          <ChevronRight size={22} strokeWidth={2} aria-hidden="true" />
        </button>

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
      <button
        className="item"
        onClick={() => {
          actions.reset();
          actions.setLocale(locale);
          toast(t("settings.reset"));
        }}
      >
        <span className="item__icon">
          <RotateCcw size={22} strokeWidth={2} />
        </span>
        <span className="grow">
          <span className="item__title" style={{ display: "block" }}>
            {t("settings.reset")}
          </span>
          <span className="t-cap">{t("settings.resetHint")}</span>
        </span>
      </button>
      <p className="t-cap" style={{ textAlign: "center", marginTop: 26 }}>
        {t("settings.about")}
      </p>
    </main>
  );
}
