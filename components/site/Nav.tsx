"use client";

import { useEffect, useRef, useState } from "react";
import type { SiteDict } from "@/content/site/types";
import { getLenis } from "@/lib/site/lenis";

export function Nav({ t, contactHref }: { t: SiteDict["nav"]; contactHref: string }) {
  const [open, setOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const otherLang = t.switchHref === "/" ? "mk" : "en";

  useEffect(() => {
    const lenis = getLenis();
    if (open) {
      lenis?.stop();
      sheet.current?.querySelector<HTMLAnchorElement>("a")?.focus();
    } else {
      lenis?.start();
    }
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        toggle.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <a className="skip" href="#main">
        {t.skip}
      </a>
      <header className="nav" data-nav data-open={open || undefined}>
        <div className="nav__bar">
          <a className="wordmark nav__mark" href="#top" aria-label={t.home}>
            Teacher<span>Aid</span>
          </a>
          <nav className="nav__links" aria-label={t.menu}>
            <ul>
              {t.links.map((l) => (
                <li key={l.href}>
                  <a href={l.href}>{l.label}</a>
                </li>
              ))}
            </ul>
          </nav>
          <div className="nav__end">
            <a className="nav__lang" href={t.switchHref} hrefLang={otherLang} lang={otherLang} aria-label={t.switchLabel}>
              {t.switchShort}
            </a>
            <a className="btn btn--primary btn--sm nav__cta" href={contactHref}>
              {t.cta}
            </a>
            <button
              ref={toggle}
              type="button"
              className="btn btn--ghost btn--sm nav__toggle"
              aria-expanded={open}
              aria-controls="site-menu"
              onClick={() => setOpen((v) => !v)}
            >
              {open ? t.close : t.menu}
            </button>
          </div>
        </div>
      </header>

      <div
        id="site-menu"
        ref={sheet}
        className="menu"
        data-open={open || undefined}
        inert={!open}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("a")) setOpen(false);
        }}
      >
        <nav aria-label={t.menu}>
          <ul className="menu__links">
            {t.links.map((l) => (
              <li key={l.href}>
                <a href={l.href}>{l.label}</a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="menu__end">
          <a className="btn btn--primary" href={contactHref}>
            {t.cta}
          </a>
          <a className="link" href={t.switchHref} hrefLang={otherLang} lang={otherLang}>
            {t.switchLabel}
          </a>
        </div>
      </div>
    </>
  );
}
