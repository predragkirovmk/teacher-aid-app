"use client";

import { CheckIcon, CloudArrowUpIcon, WifiHighIcon, WifiLowIcon, WifiSlashIcon, type Icon } from "@phosphor-icons/react";
import { useQT } from "@/lib/app/quiz-copy";
import { useNet } from "@/lib/app/session/net";

/**
 * The one quiet word about the connection: offline, reconnecting, back, and how many answers are saved
 * and waiting (lib/app/session/net.ts decides what is true; this only says it). Each state is an icon
 * and words, never a colour alone, and none of it is red. In the quiz it is a strip in the flow above the
 * header; elsewhere it floats at the top like a toast, and says nothing while all is well.
 */
export function ConnectionPill({ variant, answerShown = false }: { variant: "float" | "inline"; answerShown?: boolean }) {
  const { t } = useQT();
  const net = useNet();

  // When the screen already shows where the student's answer has got to, the strip does not say it again.
  const lead = net.banner ? t(`net.${net.banner}`) : net.sent && !answerShown ? t("ans.sent") : null;
  const saved = answerShown || net.pending === 0 ? null : net.pending === 1 ? t("net.saved.one") : t("net.saved.many", { n: net.pending });
  if (!lead && !saved) return null;

  const Glyph: Icon = net.banner === "offline" ? WifiSlashIcon : net.banner === "reconnecting" ? WifiLowIcon : net.banner === "back" ? WifiHighIcon : lead ? CheckIcon : CloudArrowUpIcon;
  return (
    <p className={variant === "float" ? "net-pill glass" : "q-note q-note--conn"} role="status" data-net={net.banner ?? (lead ? "sent" : "saved")}>
      <Glyph size={18} aria-hidden="true" />
      <span className="net-pill__text">
        {lead && <span>{lead}</span>}
        {saved && <span className="net-pill__saved">{saved}</span>}
      </span>
    </p>
  );
}

/** Where the student's own answer has got to, under the card that holds it. */
export function AnswerDelivery({ status }: { status: "sending" | "saved" | "sent" }) {
  const { t } = useQT();
  const Glyph: Icon = status === "sent" ? CheckIcon : CloudArrowUpIcon;
  return (
    <p key={status} className="q-delivery" data-status={status} role="status">
      <Glyph size={20} weight={status === "sent" ? "bold" : "regular"} aria-hidden="true" />
      {status === "sent" ? t("ans.sent") : status === "saved" ? t("ans.saved") : t("ans.saving")}
    </p>
  );
}
