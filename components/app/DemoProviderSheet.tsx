"use client";

import type { AuthProvider } from "@/lib/app/api/types";
import { finishDemoSignIn, type DemoAccount } from "@/lib/app/demo";
import { useT } from "@/lib/app/i18n";
import { providerName } from "@/lib/app/signin";
import { ProviderMark } from "./ProviderMark";
import { Sheet } from "./Shell";

/**
 * The demo's stand-in for Google's or Microsoft's own sign-in page (mock mode only, never in a live build: the welcome screen loads
 * it behind the build-time test). The mock's `startSignIn` sends the browser here, and each choice returns through the mock's
 * callback, which signs the student in or sends them back with `?error=`, as the API's `GET /auth/callback/{provider}` does.
 */
export function DemoProviderSheet({ provider, returnTo, onClose }: { provider: AuthProvider; returnTo: string; onClose: () => void }) {
  const { t } = useT();
  const name = providerName(provider);

  // A full load, as the live callback's redirect is: the page that comes back knows the session from the start.
  const choose = (account: DemoAccount) => window.location.assign(finishDemoSignIn(account, returnTo));

  return (
    // Leaving the sheet is going back from the provider's page: nothing was chosen, nothing changes.
    <Sheet label={t("signin.demo.title", { provider: name })} onClose={onClose}>
      {() => (
        <>
          <p className="sheet__title demo-sheet__title">
            <ProviderMark provider={provider} />
            {t("signin.demo.title", { provider: name })}
          </p>
          <p className="t-body steps__note">{t("signin.demo.note", { provider: name })}</p>
          <button className="btn btn--primary btn--block" onClick={() => choose("marko")}>
            {t("signin.demo.marko")}
          </button>
          <button className="btn btn--ghost btn--block" onClick={() => choose("personal")}>
            {t("signin.demo.personal")}
          </button>
          <button className="btn btn--ghost btn--block" onClick={() => choose("cancel")}>
            {t("signin.demo.cancel", { provider: name })}
          </button>
        </>
      )}
    </Sheet>
  );
}
