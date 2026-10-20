"use client";

import { Mark } from "@/components/app/Mark";
import { demoOnly } from "@/lib/app/api";
import { resetDemo } from "@/lib/app/demo";
import { useT } from "@/lib/app/i18n";

/**
 * Shown instead of the app shell when a screen fails to render, so a tester gets a way back
 * (retry, or reset the demo data) instead of the browser's dead-end error page.
 */
export default function AppError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const { t } = useT();
  return (
    <div className="stage">
      <div className="phone">
        <main className="screen screen--bare">
          <div className="welcome">
            <Mark size={72} />
            <h1 className="t-display" style={{ fontSize: "var(--fs-title1)", marginTop: 16 }}>
              {t("error.title")}
            </h1>
            <p className="muted" style={{ margin: 0 }}>
              {t(demoOnly ? "error.body" : "error.bodyLive")}
            </p>
            <button className="btn btn--primary btn--block" style={{ marginTop: 28 }} onClick={retry}>
              {t("error.retry")}
            </button>
            {demoOnly && (
              <button
                className="btn btn--ghost btn--block"
                onClick={() => {
                  resetDemo();
                  retry();
                }}
              >
                {t("settings.reset")}
              </button>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
