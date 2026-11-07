"use client";

import { useEffect, useId, useRef } from "react";
import { completeDemoSignIn } from "@/lib/teacher/api/mock-browser";
import type { DemoAccount } from "@/lib/teacher/api/mock-session";
import type { AuthProvider } from "@/lib/teacher/api/types";
import { useT } from "@/lib/teacher/i18n";
import { providerName } from "@/lib/teacher/signin";
import { ProviderMark } from "./ProviderMark";

export { readDemoProvider } from "@/lib/teacher/api/mock-session";

/**
 * The demo's stand-in for Google's or Microsoft's own sign-in page (mock mode only, never in a live build: the sign-in screen
 * loads it behind the build-time test). The mock's `startSignIn` sends the browser to the sign-in screen with this open, and
 * each choice returns through the mock's callback, which signs the teacher in or sends them back with `?error=`, as the
 * API's `GET /auth/callback/{provider}` does. It says it is a demo, in words and with a tag, so nobody takes it for the real page.
 */
export function DemoSignInSheet({
  provider,
  returnTo,
  onClose,
  onOffline,
}: {
  provider: AuthProvider;
  returnTo: string;
  onClose: () => void;
  /** "No internet" is played by the sign-in screen: nothing reaches the API, so there is no callback to come back from. */
  onOffline: () => void;
}) {
  const { t } = useT();
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useId();
  const note = useId();
  const name = providerName(provider);
  const vars = { provider: name };

  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal();
  }, []);

  // A full page load, as the live callback's redirect is: the page that comes back knows the session from the start.
  const choose = (account: DemoAccount) => {
    if (account === "offline") return onOffline();
    window.location.assign(completeDemoSignIn(account, returnTo));
  };

  return (
    // Leaving the sheet is going back from the provider's page: nothing was chosen, nothing changes.
    <dialog ref={dialog} className="dialog dialog--sheet" aria-labelledby={heading} aria-describedby={note} onClose={onClose}>
      <p className="tag tag--solo">{t("demo.sheet.tag")}</p>
      <h2 id={heading} className="dialog__title sheet__title">
        <ProviderMark provider={provider} size={32} />
        {t("demo.sheet.title", vars)}
      </h2>
      <p id={note} className="dialog__body">
        {t("demo.sheet.note", vars)}
      </p>

      <h3 className="sheet__label">{t("demo.sheet.in")}</h3>
      <div className="sheet__group">
        <button type="button" className="btn btn--primary btn--who" onClick={() => choose("veteran")}>
          <span>{t("demo.sheet.veteran")}</span>
          <small>{t("demo.sheet.veteran.hint")}</small>
        </button>
        <button type="button" className="btn btn--secondary btn--who" onClick={() => choose("novice")}>
          <span>{t("demo.sheet.novice")}</span>
          <small>{t("demo.sheet.novice.hint")}</small>
        </button>
      </div>

      <h3 className="sheet__label">{t("demo.sheet.problems")}</h3>
      <div className="sheet__group sheet__group--grid">
        <button type="button" className="btn btn--secondary" onClick={() => choose("not_invited")}>
          {t("demo.sheet.not_invited")}
        </button>
        <button type="button" className="btn btn--secondary" onClick={() => choose("personal")}>
          {t("demo.sheet.personal")}
        </button>
        <button type="button" className="btn btn--secondary" onClick={() => choose("cancelled")}>
          {t("demo.sheet.cancelled", vars)}
        </button>
        <button type="button" className="btn btn--secondary" onClick={() => choose("offline")}>
          {t("demo.sheet.offline")}
        </button>
      </div>

      <button type="button" className="btn btn--secondary sheet__back" onClick={() => dialog.current?.close()}>
        {t("back")}
      </button>
    </dialog>
  );
}
