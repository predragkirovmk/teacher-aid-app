"use client";

import {
  CheckCircleIcon,
  ClockIcon,
  DeviceMobileSlashIcon,
  HourglassIcon,
  PlugsIcon,
  type Icon,
} from "@phosphor-icons/react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { clearNoDevice, markNoDevice } from "@/lib/teacher/api/hooks";
import { isApiError } from "@/lib/teacher/api/errors";
import type { ConsoleStudent, NoDeviceReason } from "@/lib/teacher/api/types";
import { personName } from "@/lib/teacher/format";
import { useT, type Key } from "@/lib/teacher/i18n";
import { canMarkNoDevice, joinedCount, NO_DEVICE_REASONS, rosterSections, studentState, type StudentState } from "@/lib/teacher/live";
import { clockTime } from "@/lib/teacher/when";
import { Choices } from "./Choices";
import { Problem } from "./Problem";

const STATE_WORDS = {
  joined: "live.student.joined",
  late: "live.student.late",
  not_yet: "live.student.not_yet",
  offline: "live.student.offline",
  no_device: "live.student.no_device",
} as const satisfies Record<StudentState, Key>;

const STATE_ICONS: Record<StudentState, Icon> = {
  joined: CheckCircleIcon,
  late: ClockIcon,
  not_yet: HourglassIcon,
  offline: PlugsIcon,
  no_device: DeviceMobileSlashIcon,
};

const REASON_WORDS = {
  no_phone: "live.reason.no_phone",
  battery: "live.reason.battery",
  no_data: "live.reason.no_data",
  no_focus_authorization: "live.reason.no_focus_authorization",
} as const satisfies Record<NoDeviceReason, Key>;

/** How long the joined count must stay as it is before it is read out. */
export const CALM_COUNT_MS = 4000;

/** The text once it has stopped changing for a while; the first text is there at once and is not announced. */
function useCalm(text: string, ms = CALM_COUNT_MS): string {
  const [calm, setCalm] = useState(text);
  useEffect(() => {
    const id = setTimeout(() => setCalm(text), ms);
    return () => clearTimeout(id);
  }, [text, ms]);
  return calm;
}

/**
 * Every student of the class, by name, with where each one stands in an icon and a word (never colour alone): not here yet, here, late
 * (after the lesson began), the connection lost, or present without a phone and why. Two calm groups: those who are not here yet come first,
 * so the ones to look for are together, and a student moves only when something about them changes. A student who is not here has "Без
 * телефон" beside them, which asks the reason, and a student marked so has "Отстрани ја ознаката" (F-11, FR-ATT-04). A student marked who
 * then joins with a phone is simply here: the console is told, and the mark and its reason are gone.
 */
export function LiveRoster({ sessionId, students }: { sessionId: string; students: readonly ConsoleStudent[] }) {
  const { t, te, locale } = useT();
  const title = useId();
  const [asking, setAsking] = useState<ConsoleStudent | null>(null);
  // What was done, said once and read out; and which button the focus goes to when the row has moved (the buttons of a row come and go).
  const [said, setSaid] = useState<string | null>(null);
  const [removeProblem, setRemoveProblem] = useState<{ id: string; error: unknown } | null>(null);
  const [after, setAfter] = useState<{ id: string; button: "remove" | "mark" } | null>(null);

  const counts = joinedCount(students);
  const calmCount = useCalm(t("live.count", { n: counts.joined, total: counts.total }));
  const { missing, here } = rosterSections(students);

  // After a change the row's own button has changed too: the focus goes to the one that took its place, so a keyboard is not left on nothing.
  // It is asked for once the change has been answered, so the row is already drawn with its new button.
  useEffect(() => {
    if (after) document.querySelector<HTMLElement>(`[data-${after.button}="${CSS.escape(after.id)}"]`)?.focus();
  }, [after]);

  const name = (s: ConsoleStudent) => personName(s.full_name, locale);

  const remove = async (s: ConsoleStudent) => {
    setRemoveProblem(null);
    try {
      await clearNoDevice(sessionId, s.id);
      setSaid(t("live.nophone.removed", { name: name(s) }));
      setAfter({ id: s.id, button: "mark" });
    } catch (e) {
      setRemoveProblem({ id: s.id, error: e });
    }
  };

  const row = (s: ConsoleStudent) => {
    const state = studentState(s);
    const StateIcon = STATE_ICONS[state];
    const detail =
      state === "no_device" && s.no_device_reason
        ? t(REASON_WORDS[s.no_device_reason])
        : s.joined_at && (state === "joined" || state === "late" || state === "offline")
          ? t(s.attendance === "late" ? "live.student.late.at" : "live.student.at", { time: clockTime(Date.parse(s.joined_at)) })
          : null;
    return (
      <li key={s.id} className="person" data-state={state}>
        <span className="person__name">{name(s)}</span>
        <span className="person__state">
          <StateIcon size={24} weight={state === "joined" ? "fill" : "regular"} aria-hidden="true" />
          <span>
            <span className="person__word">{t(STATE_WORDS[state])}</span>
            {detail && <span className="person__detail">{detail}</span>}
          </span>
        </span>
        {state === "not_yet" && canMarkNoDevice(s) && (
          <button
            type="button"
            className="btn btn--secondary btn--small person__action"
            data-mark={s.id}
            aria-label={t("live.nophone.name", { name: name(s) })}
            aria-haspopup="dialog"
            onClick={() => setAsking(s)}
          >
            {t("live.nophone")}
          </button>
        )}
        {state === "no_device" && (
          <button
            type="button"
            className="btn btn--secondary btn--small person__action"
            data-remove={s.id}
            aria-label={t("live.nophone.remove.name", { name: name(s) })}
            onClick={() => void remove(s)}
          >
            {t("live.nophone.remove")}
          </button>
        )}
        {removeProblem?.id === s.id && (
          <div className="person__problem">
            <Problem title={t("live.nophone.remove.failed")}>{te(removeProblem.error)}</Problem>
          </div>
        )}
      </li>
    );
  };

  const group = (id: string, label: Key, list: readonly ConsoleStudent[], empty?: ReactNode) => (
    <section className="roster__group" aria-labelledby={`${title}-${id}`}>
      <h3 id={`${title}-${id}`} className="roster__heading">
        {t("list.count", { label: t(label), n: list.length })}
      </h3>
      {list.length > 0 ? <ul className="roster__list">{list.map(row)}</ul> : empty}
    </section>
  );

  return (
    <section className="card roster" aria-labelledby={title}>
      <h2 id={title}>{t("live.joined.title")}</h2>
      <p className="roster__count">{t("live.count", { n: counts.joined, total: counts.total })}</p>
      {counts.withoutPhone > 0 && <p className="roster__nophone">{t("live.count.nophone", { n: counts.withoutPhone })}</p>}
      {/* The same line twice: once to be read out (a region that is always there, so a change in it is announced), once to be seen, which takes room only while it has something to say. */}
      <p className="sr" role="status">
        {said}
      </p>
      {said && (
        <p className="status roster__said" aria-hidden="true">
          <CheckCircleIcon size={28} weight="fill" aria-hidden="true" />
          {said}
        </p>
      )}
      {/* Joins come in a stream; a screen reader hears the count once they have slowed, not every name. */}
      <p className="sr" role="status" data-testid="calm-count">
        {calmCount}
      </p>
      {group(
        "missing",
        "live.missing.title",
        missing,
        <p className="roster__none">
          <CheckCircleIcon size={28} weight="fill" aria-hidden="true" />
          {t("live.missing.none")}
        </p>,
      )}
      {group("here", "live.here.title", here)}
      {asking && (
        <NoDeviceDialog
          sessionId={sessionId}
          student={asking}
          studentName={name(asking)}
          onClose={() => setAsking(null)}
          onDone={() => {
            setSaid(t("live.nophone.done", { name: name(asking) }));
            setAfter({ id: asking.id, button: "remove" });
          }}
        />
      )}
    </section>
  );
}

/**
 * The four reasons in plain words, and one yellow button that marks the student: "Confirming marks present_no_device with no further
 * question." Nothing is chosen at first, so a wrong tap is not made for the teacher; Enter on the choices starts nothing. The student
 * may have joined with a phone while the teacher was choosing: then the console says so and marks nothing.
 */
function NoDeviceDialog({
  sessionId,
  student,
  studentName,
  onClose,
  onDone,
}: {
  sessionId: string;
  student: ConsoleStudent;
  studentName: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t, te } = useT();
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useId();
  const body = useId();
  const pick = useId();
  const [reason, setReason] = useState<NoDeviceReason | null>(null);
  const [asked, setAsked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<unknown>(null);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (!d.open) d.showModal();
    d.querySelector<HTMLElement>("input[type=radio]")?.focus();
  }, []);

  const confirm = async () => {
    if (busy) return;
    if (!reason) {
      setAsked(true);
      dialog.current?.querySelector<HTMLElement>("input[type=radio]")?.focus();
      return;
    }
    setBusy(true);
    setProblem(null);
    try {
      await markNoDevice(sessionId, student.id, reason);
      onDone();
      dialog.current?.close();
    } catch (e) {
      setProblem(e);
      setBusy(false);
    }
  };

  const joined = isApiError(problem) && problem.code === "invalid_state";

  return (
    <dialog ref={dialog} className="dialog" aria-labelledby={heading} aria-describedby={body} onClose={onClose}>
      <h2 id={heading} className="dialog__title">
        {t("live.nophone.title", { name: studentName })}
      </h2>
      <p id={body} className="dialog__body">
        {t("live.nophone.body")}
      </p>
      <Choices
        name="reason"
        labelledBy={heading}
        describedBy={asked && !reason ? pick : undefined}
        value={reason}
        onChange={(value) => {
          setReason(value);
          setAsked(false);
        }}
        options={NO_DEVICE_REASONS.map((value) => ({ value, label: t(REASON_WORDS[value]) }))}
      />
      {asked && !reason && <Problem id={pick}>{t("live.nophone.pick")}</Problem>}
      {problem !== null && (
        <Problem title={t("live.nophone.failed", { name: studentName })}>{joined ? t("live.nophone.joined", { name: studentName }) : te(problem)}</Problem>
      )}
      <div className="dialog__actions">
        <button type="button" className="btn btn--primary" aria-busy={busy} disabled={busy} onClick={() => void confirm()}>
          <DeviceMobileSlashIcon size={24} aria-hidden="true" />
          {t("live.nophone.confirm")}
        </button>
        <button type="button" className="btn btn--secondary" onClick={() => dialog.current?.close()}>
          {t("start.cancel")}
        </button>
      </div>
    </dialog>
  );
}
