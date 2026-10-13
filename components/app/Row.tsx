"use client";

import { CaretRightIcon, type Icon } from "@phosphor-icons/react";
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
  icon: Icon;
  label: string;
  value?: ReactNode;
  href?: string;
  onClick?: () => void;
  chevron?: boolean;
}) {
  const body = (
    <>
      <span className="item__icon">
        <Icon size={22} aria-hidden="true" />
      </span>
      {/* At large text sizes the value wraps under the label instead of colliding with it. */}
      <span className="grow item__main">
        <span className="item__title">{label}</span>
        {value && <span className="t-cap">{value}</span>}
      </span>
      {chevron && <CaretRightIcon size={22} aria-hidden="true" />}
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
