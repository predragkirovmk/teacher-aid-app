"use client";

import { CaretLeftIcon } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useT } from "@/lib/app/i18n";
import { backWithMorph } from "@/lib/app/nav";

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
  const router = useRouter();
  const { t } = useT();
  return (
    <>
      <div className="top">
        <button
          className="round"
          aria-label={t("back")}
          onClick={() => {
            if (onBack) onBack();
            else if (window.history.length > 1) backWithMorph(router);
            else router.push("/app");
          }}
        >
          <CaretLeftIcon size={26} />
        </button>
        <div>{right}</div>
      </div>
      <h1 className={quiet ? "sr" : "large"}>{title}</h1>
    </>
  );
}
