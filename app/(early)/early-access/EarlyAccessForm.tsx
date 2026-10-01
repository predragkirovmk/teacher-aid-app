"use client";

import { useState, useSyncExternalStore } from "react";

const ERRORS: Record<string, string> = {
  invalid_email: "Check the email address and try again.",
  rate_limited: "Too many tries. Wait a minute and try again.",
  network: "No connection. Try again in a moment.",
  server_error: "Something went wrong. Try again.",
};

const noop = () => () => {};

export function EarlyAccessForm() {
  // False in the server HTML, true once hydrated: the button stays off until then, so a tap
  // on slow wifi can never submit the form natively before the page is ready.
  const ready = useSyncExternalStore(noop, () => true, () => false);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending) return;
    const data = new FormData(event.currentTarget);
    setSending(true);
    setError("");
    try {
      const res = await fetch("/api/early-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: data.get("email"),
          website: data.get("website"),
          src: new URLSearchParams(window.location.search).get("src"),
        }),
      });
      if (res.ok) {
        setDone(true);
        return;
      }
      const body: { error?: string } = await res.json().catch(() => ({}));
      setError(ERRORS[body.error ?? ""] ?? ERRORS.server_error);
    } catch {
      setError(ERRORS.network);
    } finally {
      setSending(false);
    }
  }

  if (done) {
    return (
      <p className="ea-done" role="status">
        You’re in. Thank you.
      </p>
    );
  }

  return (
    <form className="ea-form" method="post" action="/api/early-access" onSubmit={onSubmit}>
      <label className="ea-sr" htmlFor="ea-email">
        Email
      </label>
      <input
        id="ea-email"
        className="ea-input"
        name="email"
        type="email"
        autoComplete="email"
        inputMode="email"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="send"
        placeholder="you@school.edu"
        required
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? "ea-error" : undefined}
      />

      <div className="ea-hp" aria-hidden="true">
        <label>
          Website
          <input name="website" type="text" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      {error && (
        <p id="ea-error" className="ea-error" role="alert">
          {error}
        </p>
      )}

      <button className="ea-button" type="submit" disabled={!ready || sending}>
        {sending ? "Sending..." : "Get early access"}
      </button>

      <p className="ea-fine">We’ll only email you about TeacherAid. Unsubscribe anytime.</p>
    </form>
  );
}
