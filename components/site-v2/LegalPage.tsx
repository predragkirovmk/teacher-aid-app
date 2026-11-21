import type { Metadata } from "next";
import { chrome, homePaths } from "@/content/site-v2/pages";
import type { LegalMeta, TermsDict } from "@/content/site-v2/terms";
import type { Lang, SiteV2Dict } from "@/content/site-v2/types";
import { SiteFooter } from "./Footer";
import { Nav } from "./Nav";

const dateFormat: Record<Lang, Intl.DateTimeFormat> = {
  mk: new Intl.DateTimeFormat("mk-MK", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }),
  en: new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }),
};

/**
 * A legal page's metadata. Legal pages stay out of search results (noindex, and they are not in the sitemap), but their
 * links are followed, and each language names the other as its pair.
 */
export function legalMetadata(doc: TermsDict, legal: LegalMeta): Metadata {
  return {
    title: doc.meta.title,
    description: doc.meta.description,
    alternates: {
      canonical: legal.paths[doc.lang],
      languages: { mk: legal.paths.mk, en: legal.paths.en, "x-default": legal.paths.mk },
    },
    robots: { index: false, follow: true },
  };
}

/**
 * The terms of service and the privacy policy, in the reading pages' look: the bar, a plain header with the version and
 * the date, the short version, a list of contents, every clause as server-rendered text, and the footer. Nothing moves
 * and nothing is hidden; a school's lawyer reads it top to bottom.
 */
export function LegalPage({ t, doc, legal }: { t: SiteV2Dict; doc: TermsDict; legal: LegalMeta }) {
  const c = chrome[t.lang];
  const home = homePaths[t.lang];
  const other = t.lang === "mk" ? "en" : "mk";

  return (
    <>
      <Nav t={t.nav} ctaHref={`${home}#book`} home={home} switchHref={legal.paths[other]} />

      <main id="main" tabIndex={-1} className="article terms">
        <header className="wrap article__head" data-theme="paper">
          <nav aria-label={c.breadcrumbLabel} className="crumbs">
            <ol>
              <li>
                <a href={home}>{c.homeName}</a>
              </li>
              <li aria-current="page">{doc.name}</li>
            </ol>
          </nav>
          <p className="kicker">{doc.kicker}</p>
          <h1 className="display display--ink article__title">{doc.title}</h1>
          <p className="lead article__lead">{doc.lead}</p>
          <p className="note note--ink">
            {doc.versionLabel} {legal.version}. {doc.updatedLabel}:{" "}
            <time dateTime={legal.updated}>{dateFormat[t.lang].format(new Date(legal.updated))}</time>
          </p>
        </header>

        <div className="wrap article__body">
          <section className="article__section" aria-labelledby="summary-title">
            <h2 id="summary-title">{doc.summaryTitle}</h2>
            <ul className="article__list">
              {doc.summary.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </section>

          <nav className="article__section" aria-labelledby="contents-title">
            <h2 id="contents-title">{doc.contentsLabel}</h2>
            <ol className="terms__contents">
              {doc.sections.map((s) => (
                <li key={s.id}>
                  <a href={`#${s.id}`}>{s.title}</a>
                </li>
              ))}
            </ol>
          </nav>

          {doc.sections.map((s) => (
            <section key={s.id} id={s.id} className="article__section" aria-labelledby={`${s.id}-title`}>
              <h2 id={`${s.id}-title`}>{s.title}</h2>
              {s.blocks.map((b, i) =>
                "p" in b ? (
                  <p key={i}>{b.p}</p>
                ) : (
                  <ul key={i} className="article__list">
                    {b.ul.map((li) => (
                      <li key={li}>{li}</li>
                    ))}
                  </ul>
                ),
              )}
            </section>
          ))}
        </div>
      </main>

      <SiteFooter t={t} current={legal.key} />
    </>
  );
}
