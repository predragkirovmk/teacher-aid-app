"use client";

import { useEffect, useRef, useState } from "react";
import { Mark } from "@/components/app/Mark";
import type { SiteV2Dict } from "@/content/site-v2/types";
import { getLenis } from "@/lib/site-v2/lenis";

/**
 * The slim bar on top. It takes the theme of the section under it (paper, teal, blue or yellow), gains a
 * hairline once the page has moved, and opens a full-screen menu on narrow screens. Solid
 * colours only: a blurred bar re-blurs the page on every scrolled frame.
 */
export function Nav({ t, ctaHref }: { t: SiteV2Dict["nav"]; ctaHref: string }) {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<"paper" | "teal" | "blue" | "yellow">("paper");
  const [moved, setMoved] = useState(false);
  const bar = useRef<HTMLElement>(null);
  const sentinel = useRef<HTMLSpanElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const otherLang = t.switchHref === "/v2" ? "mk" : "en";

  // The theme under the bar: a one-pixel line through its middle decides which section it is on.
  useEffect(() => {
    const sections = Array.from(document.querySelectorAll<HTMLElement>("[data-theme]"));
    let io: IntersectionObserver | null = null;
    const watch = () => {
      io?.disconnect();
      const mid = Math.round((bar.current?.offsetHeight ?? 56) / 2);
      io = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            if (!e.isIntersecting) continue;
            const next = (e.target as HTMLElement).dataset.theme;
            setTheme(next === "teal" || next === "blue" || next === "yellow" ? next : "paper");
          }
        },
        { rootMargin: `-${mid}px 0px -${Math.max(0, window.innerHeight - mid - 1)}px 0px` },
      );
      sections.forEach((s) => io!.observe(s));
    };
    watch();
    window.addEventListener("resize", watch);

    // An 8px strip at the top of the page: once it has scrolled away, the bar gains its hairline.
    const moveIo = new IntersectionObserver(([e]) => setMoved(!e.isIntersecting));
    if (sentinel.current) moveIo.observe(sentinel.current);

    return () => {
      io?.disconnect();
      moveIo.disconnect();
      window.removeEventListener("resize", watch);
    };
  }, []);

  useEffect(() => {
    const lenis = getLenis();
    document.documentElement.classList.toggle("menu-open", open);
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
      <span ref={sentinel} className="nav__sentinel" aria-hidden="true" />
      <a className="skip" href="#main">
        {t.skip}
      </a>
      <header ref={bar} className="nav" data-nav-theme={open ? "paper" : theme} data-moved={moved || undefined}>
        <div className="wrap nav__bar">
          <a className="nav__mark" href="#top" aria-label={t.home}>
            <Mark size={26} />
            <span>TeacherAid</span>
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
            <a className="btn btn--primary btn--sm nav__cta" href={ctaHref}>
              {t.cta}
            </a>
            <button
              ref={toggle}
              type="button"
              className="btn btn--quiet btn--sm nav__toggle"
              aria-expanded={open}
              aria-controls="v2-menu"
              onClick={() => setOpen((v) => !v)}
            >
              {open ? t.close : t.menu}
            </button>
          </div>
        </div>
      </header>

      {/* Closed, the sheet is invisible and inert; it fades out instead of vanishing. */}
      <div id="v2-menu" ref={sheet} className="menu" data-open={open || undefined} inert={!open}>
        <nav className="wrap menu__inner" aria-label={t.menu}>
          <ul>
            {t.links.map((l, i) => (
              <li key={l.href} style={{ "--n": i } as React.CSSProperties}>
                <a href={l.href} onClick={() => setOpen(false)}>
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
          <div className="menu__end" style={{ "--n": t.links.length } as React.CSSProperties}>
            <a className="btn btn--primary" href={ctaHref} onClick={() => setOpen(false)}>
              {t.cta}
            </a>
            <a className="chev" href={t.switchHref} hrefLang={otherLang} lang={otherLang}>
              {t.switchLabel}
            </a>
          </div>
        </nav>
      </div>
    </>
  );
}
