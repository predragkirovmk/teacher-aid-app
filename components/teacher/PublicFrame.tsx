"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Mark } from "@/components/app/Mark";
import { useT } from "@/lib/teacher/i18n";
import { SIGN_IN } from "@/lib/teacher/signin";

/**
 * The frame of a page anyone may open without signing in (Help): the logo and a way to the sign-in screen, and no sidebar,
 * since every place the sidebar leads to needs a signed-in teacher.
 */
export function PublicFrame({ children }: { children: ReactNode }) {
  const { t } = useT();
  return (
    <div className="public">
      <a href="#main" className="btn btn--secondary btn--small skip">
        {t("skip")}
      </a>
      <header className="entry__top">
        <Link href={SIGN_IN} className="brand__link">
          <Mark size={44} />
          <span className="brand__word">TeacherAid</span>
        </Link>
        <Link href={SIGN_IN} className="btn btn--secondary btn--small">
          {t("public.signin")}
        </Link>
      </header>
      <main id="main" className="main main--public" tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}
