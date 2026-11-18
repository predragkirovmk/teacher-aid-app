"use client";

import { CaretLeftIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { useT } from "@/lib/app/i18n";
import { useUI } from "./ui";

/**
 * Back button with an optional trailing action, then the screen's large title, as on the tab roots.
 * `quiet` keeps the title for screen readers only, for a screen whose own header already shows it large.
 */
export function Top({
  title,
  right,
  onBack,
  quiet = false,
}: {
  title: string;
  right?: ReactNode;
  onBack?: () => void;
  quiet?: boolean;
}) {
  const { t } = useT();
  const { back } = useUI();
  return (
    <>
      <div className="top">
        <button
          className="round"
          aria-label={t("back")}
          onClick={onBack ?? back}
        >
          <CaretLeftIcon size={26} />
        </button>
        <div>{right}</div>
      </div>
      <h1 className={quiet ? "sr" : "large"}>{title}</h1>
    </>
  );
}
