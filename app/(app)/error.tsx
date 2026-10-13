"use client";

import { Mark } from "@/components/app/Mark";
import { useT } from "@/lib/app/i18n";
import { actions } from "@/lib/app/store";

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
            <h1 className="t-display" style={{ fontSize: 28, marginTop: 16 }}>
              {t("error.title")}
            </h1>
            <p className="muted" style={{ margin: 0 }}>
              {t("error.body")}
            </p>
            <button className="btn btn--primary btn--block" style={{ marginTop: 28 }} onClick={retry}>
              {t("error.retry")}
            </button>
            <button
              className="btn btn--ghost btn--block"
              onClick={() => {
                actions.reset();
                retry();
              }}
            >
              {t("settings.reset")}
            </button>
          </div>
        </main>
      </div>
    </div>
  );
}
