"use client";

import { CheckIcon, CloudArrowUpIcon, EyeIcon, FlagCheckeredIcon, HandPalmIcon, WarningCircleIcon, type Icon } from "@phosphor-icons/react";
import { useEffect, useId, useRef, useState } from "react";
import { ANON_MAX_LENGTH, cleanAsk } from "@/lib/app/session/ask";
import type { SessionRunView } from "@/lib/app/session/controller";
import { focusNoticeSeen, markFocusNoticeSeen } from "@/lib/app/session/focus-notice";
import { useQT } from "@/lib/app/quiz-copy";
import { buzz } from "./parts";

/** Show the counter once the question is this much used; before that it is only noise. */
const COUNT_FROM = 0.8;

/**
 * The quiet way in to a question for the teacher (F-09): a plain button under the status line, on the screens
 * where nothing is asked of the student. It is not on the screens where a question is open (see `canAsk`).
 */
export function AskEntry({ onOpen }: { onOpen: () => void }) {
  const { t } = useQT();
  return (
    <button type="button" className="btn btn--plain btn--block q-askbtn" onClick={onOpen}>
      <HandPalmIcon size={22} aria-hidden="true" />
      {t("ask.entry")}
    </button>
  );
}

/**
 * The line that tells the student, once, that leaving the quiz during a question is visible to the teacher (spec 7.10).
 * It sits in the lobby or between questions as part of the page and never as a dialog, so it delays nothing. Showing it
 * is what lets the focus flag start: nothing is recorded before a student has had it in front of them.
 */
export function FocusNotice() {
  const { t } = useQT();
  // Read once, when the screen opens: marking it seen must not take it away from the student who is reading it.
  const [show] = useState(() => !focusNoticeSeen());
  useEffect(() => {
    if (show) markFocusNoticeSeen();
  }, [show]);
  if (!show) return null;
  return (
    <p className="q-fair" role="note">
      <EyeIcon size={20} aria-hidden="true" />
      <span>{t("fair.note")}</span>
    </p>
  );
}

type BodyProps = {
  run: SessionRunView;
  /** What the student has typed and not sent; it lives above the sheet so a question starting does not lose it. */
  draft: string;
  setDraft: (text: string) => void;
  /** Hands the question to the session; returns its key, or null when it was not taken. */
  onSend: (text: string) => string | null;
  close: () => void;
};

/**
 * The sheet: what to write, who sees it, how many questions are left, then where the question has got to. The line
 * about who sees the sender is on the page with the box and in the confirmation, in words, never only an icon: classmates
 * do not see who asked, and the teacher does (BR-ANON-01). It does not say "anonymous" and so cannot imply it is to everyone.
 */
export function AskBody({ run, draft, setDraft, onSend, close }: BodyProps) {
  const { t } = useQT();
  const id = useId();
  const field = useRef<HTMLTextAreaElement>(null);
  const [key, setKey] = useState<string | null>(null);
  const [empty, setEmpty] = useState(false);
  const used = Array.from(draft).length;
  const sent = key === null ? undefined : run.asks.find((a) => a.key === key);
  const left = run.askRemaining;

  const send = () => {
    if (cleanAsk(draft) === "") {
      setEmpty(true);
      buzz(40);
      field.current?.focus();
      return;
    }
    const k = onSend(draft);
    if (k === null) return;
    buzz(14);
    setKey(k);
    setDraft("");
  };

  // After a question: where it has got to. Before one: the box, or the reason there is no box.
  const status = sent?.status ?? (run.sessionState === "ended" ? "session_ended" : left !== null && left <= 0 ? "limit_reached" : "compose");

  if (status !== "compose") {
    const R: Record<string, { icon: Icon; title: string; note: string | null }> = {
      sending: { icon: CloudArrowUpIcon, title: t("ans.saving"), note: null },
      saved: { icon: CloudArrowUpIcon, title: t("ans.saved"), note: t("ask.sentNote") },
      sent: { icon: CheckIcon, title: t("ask.sent"), note: t("ask.sentNote") },
      limit_reached: { icon: HandPalmIcon, title: t("ask.limit.title"), note: t("ask.limit.body") },
      session_ended: { icon: FlagCheckeredIcon, title: t("ask.ended.title"), note: t("ask.ended.body") },
      failed: { icon: WarningCircleIcon, title: t("ask.failed.title"), note: t("ask.failed.body") },
    };
    const r = R[status];
    const Glyph = r.icon;
    const another = (status === "sending" || status === "saved" || status === "sent") && (left === null || left > 0);
    return (
      <div className="ask">
        <div className="ask__result" key={status} role="status">
          <span className="ask__mark">
            <Glyph size={32} weight={status === "sent" ? "bold" : "regular"} aria-hidden="true" />
          </span>
          <h2 className="ask__rt">{r.title}</h2>
          {r.note && <p className="t-body muted ask__note">{r.note}</p>}
        </div>
        {status === "failed" ? (
          <button
            type="button"
            className="btn btn--primary btn--block"
            onClick={() => {
              setDraft(sent?.text ?? "");
              setKey(null);
            }}
          >
            {t("ask.again")}
          </button>
        ) : (
          <button type="button" className="btn btn--primary btn--block" onClick={close}>
            {t("ask.done")}
          </button>
        )}
        {another && (
          <button type="button" className="btn btn--plain btn--block" onClick={() => setKey(null)}>
            {t("ask.another")}
          </button>
        )}
      </div>
    );
  }

  return (
    <form
      className="ask"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
    >
      <div className="ask__head">
        <h2 className="ask__title">{t("ask.title")}</h2>
        {left !== null && <p className="t-cap ask__left">{t(left === 1 ? "ask.left.one" : "ask.left.many", { n: left })}</p>}
      </div>
      <p id={`${id}-honest`} className="ask__honest">
        <EyeIcon size={22} aria-hidden="true" />
        <span>{t("ask.honest")}</span>
      </p>
      <textarea
        ref={field}
        className="o-input"
        rows={3}
        maxLength={ANON_MAX_LENGTH}
        enterKeyHint="send"
        autoComplete="off"
        data-autofocus
        aria-label={t("ask.label")}
        aria-describedby={`${id}-honest`}
        aria-invalid={empty}
        placeholder={t("ask.placeholder")}
        value={draft}
        onChange={(e) => {
          // One paragraph, as the server keeps it: a pasted line break becomes a space, and Enter sends.
          setDraft(e.target.value.replace(/\s*\n\s*/g, " "));
          setEmpty(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            send();
          }
        }}
      />
      {(used >= ANON_MAX_LENGTH * COUNT_FROM || empty) && (
        <div className="o-meta">
          {empty ? (
            <p className="n-err" role="alert">
              <WarningCircleIcon size={20} weight="bold" aria-hidden="true" />
              {t("ask.err.empty")}
            </p>
          ) : (
            <span />
          )}
          {used >= ANON_MAX_LENGTH * COUNT_FROM && (
            <span className="o-count" role="img" aria-label={t("o.countAria", { n: used, max: ANON_MAX_LENGTH })} data-full={used >= ANON_MAX_LENGTH}>
              {used}/{ANON_MAX_LENGTH}
            </span>
          )}
        </div>
      )}
      <button type="submit" className="btn btn--primary btn--block">
        {t("ask.send")}
      </button>
    </form>
  );
}
