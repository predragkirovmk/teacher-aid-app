"use client";

import { CheckCircleIcon, ClipboardTextIcon, ClockIcon } from "@phosphor-icons/react";
import type { AlertItem } from "@/lib/app/alerts";

/**
 * Each kind of alert has its own glyph, the same ones the attendance list uses, so the list can
 * be read at a glance instead of every row carrying the same bell.
 */
export function NotifIcon({ n, size = 22 }: { n: Pick<AlertItem, "kind">; size?: number }) {
  const Icon = n.kind === "checkin" ? CheckCircleIcon : n.kind === "marked_late" ? ClockIcon : ClipboardTextIcon;
  return <Icon size={size} aria-hidden="true" />;
}
