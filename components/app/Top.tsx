"use client";

import { ChevronLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useT } from "@/lib/app/i18n";

/** Back button, centred title, optional trailing action. */
export function Top({ title, right, onBack }: { title: string; right?: ReactNode; onBack?: () => void }) {
  const router = useRouter();
  const { t } = useT();
  return (
    <div className="top">
      <button
        className="round"
        aria-label={t("back")}
        onClick={() => {
          if (onBack) onBack();
          else if (window.history.length > 1) router.back();
          else router.push("/app");
        }}
      >
        <ChevronLeft size={26} strokeWidth={2} />
      </button>
      <h1 className="top__title" style={{ margin: 0 }}>
        {title}
      </h1>
      <div>{right}</div>
    </div>
  );
}
