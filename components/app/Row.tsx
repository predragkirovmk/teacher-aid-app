"use client";

import { ChevronRight, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

/** One row of a grouped list: icon disc, label, optional value, chevron. A link or a button. */
export function Row({
  icon: Icon,
  label,
  value,
  href,
  onClick,
  chevron = true,
}: {
  icon: LucideIcon;
  label: string;
  value?: ReactNode;
  href?: string;
  onClick?: () => void;
  chevron?: boolean;
}) {
  const body = (
    <>
      <span className="item__icon">
        <Icon size={22} strokeWidth={2} aria-hidden="true" />
      </span>
      <span className="grow item__title">{label}</span>
      {value && <span className="t-cap">{value}</span>}
      {chevron && <ChevronRight size={22} strokeWidth={2} aria-hidden="true" />}
    </>
  );
  return href ? (
    <Link href={href} className="item">
      {body}
    </Link>
  ) : (
    <button className="item" onClick={onClick}>
      {body}
    </button>
  );
}
