"use client";

import { CheckCircleIcon, ClipboardTextIcon, ClockIcon } from "@phosphor-icons/react";
import type { NotifItem } from "@/lib/app/derived";

/**
 * Each kind of alert has its own glyph, the same ones the attendance list uses, so the list can
 * be read at a glance instead of every row carrying the same bell.
 */
export function NotifIcon({ n, size = 22 }: { n: Pick<NotifItem, "id" | "kind">; size?: number }) {
  const Icon = n.kind === "checkin" ? CheckCircleIcon : n.id === "n-late" ? ClockIcon : ClipboardTextIcon;
  return <Icon size={size} aria-hidden="true" />;
}
