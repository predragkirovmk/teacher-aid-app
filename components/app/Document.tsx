"use client";

import { CaretDownIcon, EyeIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { createContext, Fragment, useContext, useEffect, type ReactNode } from "react";
import { Top } from "@/components/app/Top";
import { useT } from "@/lib/app/i18n";
import { CONTACT_EMAIL, LEAVER_DELETION_DAYS, NOTICE_VERSION, noticeDateLabel } from "@/lib/app/privacy";
import type { Block, Doc, DocSection } from "@/lib/app/privacy-copy";
import { useQT } from "@/lib/app/quiz-copy";

/** The values a document's text can ask for with {name}. */
function useVars(): Record<string, string> {
  const { locale } = useT();
  return { date: noticeDateLabel(locale), version: NOTICE_VERSION, email: CONTACT_EMAIL, days: String(LEAVER_DELETION_DAYS) };
}

const fill = (text: string, vars: Record<string, string>) => text.replace(/\{(\w+)\}/g, (all, name: string) => vars[name] ?? all);

/** Text with [label](link) in it: a path in this app is a link inside it, anything else an ordinary link. */
export function Inline({ text }: { text: string }) {
  const vars = useVars();
  const parts = fill(text, vars).split(/(\[[^\]]+\]\([^)]+\))/g);
  return (
    <>
      {parts.map((part, i) => {
        const match = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
        if (!match) return <Fragment key={i}>{part}</Fragment>;
        const [, label, href] = match;
        return href.startsWith("/app") ? (
          <Link key={i} href={href} className="doc__link">
            {label}
          </Link>
        ) : (
          <a key={i} href={href} className="doc__link">
            {label}
          </a>
        );
      })}
    </>
  );
}

/** Scroll a section into view and put the keyboard there, so a jump from the list is a jump for everyone. */
function goTo(id: string) {
  const el = document.getElementById(id);
  if (!el) return false;
  const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ behavior: calm ? "auto" : "smooth", block: "start" });
  el.querySelector<HTMLElement>("h2, h3")?.focus({ preventScroll: true });
  return true;
}

/** The section named by the address (`/app/privacy#focus`) is where the screen opens. */
function useOpenAtHash() {
  useEffect(() => {
    const open = () => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      if (!id) return;
      // The element is laid out after the first paint; the screen scrolls inside itself, so ask it directly.
      document.getElementById(id)?.scrollIntoView({ block: "start" });
    };
    open();
    const later = setTimeout(open, 120);
    window.addEventListener("hashchange", open);
    return () => {
      clearTimeout(later);
      window.removeEventListener("hashchange", open);
    };
  }, []);
}

function Blocks({ blocks }: { blocks: Block[] }) {
  const { t } = useT();
  const { t: q } = useQT();
  return (
    <>
      {blocks.map((b, i) => {
        if ("p" in b)
          return (
            <p key={i} className="t-body doc__p">
              <Inline text={b.p} />
            </p>
          );
        if ("ul" in b)
          return (
            <ul key={i} className="t-body doc__list">
              {b.ul.map((li) => (
                <li key={li}>
                  <Inline text={li} />
                </li>
              ))}
            </ul>
          );
        const text = "line" in b ? t(b.line) : q(b.qline);
        return <Quote key={i} text={text} />;
      })}
    </>
  );
}

/** One of the app's own sentences, as the app says it, with a label so it is clear where it comes from. */
function Quote({ text }: { text: string }) {
  const label = useContext(LabelContext);
  return (
    <figure className="doc__quote">
      <figcaption className="t-cap doc__quote-label">
        <EyeIcon size={18} aria-hidden="true" />
        {label}
      </figcaption>
      <blockquote className="t-body doc__quote-text">{text}</blockquote>
    </figure>
  );
}

/** What a quote of the app's own words is labelled with, in the language of the document it is in. */
const LabelContext = createContext("");

/** One section, or one item inside a section: a heading the keyboard can be sent to, with its text. */
export function Section({ section }: { section: DocSection }) {
  const Heading = section.level === 2 ? "h2" : "h3";
  return (
    <section id={section.id} className={`doc__section doc__section--${section.level}`}>
      <Heading tabIndex={-1} className={section.level === 2 ? "t-title doc__h2" : "t-body doc__h3"}>
        {section.title}
      </Heading>
      <Blocks blocks={section.blocks} />
    </section>
  );
}

/**
 * A long text for a student to read (the privacy notice, the terms): the title, the date and version, an optional short
 * summary on top, a list that jumps to each section, then the sections. It is readable without signing in.
 */
export function Document({ doc, summary, jumpList = true, footer }: { doc: Doc; summary?: ReactNode; jumpList?: boolean; footer?: ReactNode }) {
  const vars = useVars();
  useOpenAtHash();
  const tops = doc.sections.filter((s) => s.level === 2);
  return (
    <main className="screen doc">
      <Top title={doc.title} />
      <p className="t-cap doc__meta">
        <span>{fill(doc.updated, vars)}</span> <span aria-hidden="true">·</span> <span>{fill(doc.version, vars)}</span>
      </p>
      {summary}
      {jumpList && (
        <nav aria-label={doc.jump}>
          <h2 className="section-h">{doc.jump}</h2>
          <ul className="list doc__jump">
            {tops.map((s) => (
              <li key={s.id}>
                <a
                  className="item"
                  href={`#${s.id}`}
                  onClick={(e) => {
                    if (goTo(s.id)) {
                      e.preventDefault();
                      window.history.replaceState(null, "", `#${s.id}`);
                    }
                  }}
                >
                  <span className="grow item__main">
                    <span className="item__title">{s.title}</span>
                  </span>
                  <CaretDownIcon size={22} aria-hidden="true" />
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}
      <LabelContext.Provider value={doc.appSays}>
        <div className="doc__body">
          {doc.sections.map((s) => (
            <Section key={s.id} section={s} />
          ))}
        </div>
      </LabelContext.Provider>
      {footer}
    </main>
  );
}
