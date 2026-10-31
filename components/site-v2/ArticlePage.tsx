import { chrome, homePaths, pagePaths, pageUpdated, type ArticleDict } from "@/content/site-v2/pages";
import type { SiteV2Dict } from "@/content/site-v2/types";
import { SiteFooter } from "./Footer";
import { JsonLd } from "./JsonLd";
import { Nav } from "./Nav";

const dateFormat: Record<SiteV2Dict["lang"], Intl.DateTimeFormat> = {
  mk: new Intl.DateTimeFormat("mk-MK", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }),
  en: new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }),
};

/**
 * A reading page (FAQ, comparison, about): the home page's bar and footer around plain, server-
 * rendered text. No motion layer; every word is in the HTML. Question headings and short
 * self-contained answers, because a teacher, a search engine and an answer engine all read one
 * answer at a time.
 */
export function ArticlePage({ t, page }: { t: SiteV2Dict; page: ArticleDict }) {
  const c = chrome[t.lang];
  const home = homePaths[t.lang];
  const path = pagePaths[page.key][t.lang];
  const other = t.lang === "mk" ? "en" : "mk";
  const updated = pageUpdated[page.key];
  const mailto = `mailto:${c.book.email}`;

  return (
    <>
      <JsonLd
        lang={t.lang}
        path={path}
        name={page.meta.title}
        description={page.meta.description}
        updated={updated}
        type={page.key === "about" ? "AboutPage" : "WebPage"}
        crumbs={[
          { name: c.homeName, path: home },
          { name: page.name, path },
        ]}
      />
      <Nav t={t.nav} ctaHref="#book" home={home} switchHref={pagePaths[page.key][other]} />

      <main id="main" tabIndex={-1} className="article">
        <header className="wrap article__head" data-theme="paper">
          <nav aria-label={c.breadcrumbLabel} className="crumbs">
            <ol>
              <li>
                <a href={home}>{c.homeName}</a>
              </li>
              <li aria-current="page">{page.name}</li>
            </ol>
          </nav>
          <p className="kicker">{page.kicker}</p>
          <h1 className="display display--ink article__title">{page.title}</h1>
          <p className="lead article__lead">{page.lead}</p>
          <p className="note note--ink">
            {c.updated}: <time dateTime={updated}>{dateFormat[t.lang].format(new Date(updated))}</time>
          </p>
        </header>

        <div className="wrap article__body">
          {page.sections.map((s) => (
            <section key={s.id} id={s.id} className="article__section" aria-labelledby={`${s.id}-title`}>
              <h2 id={`${s.id}-title`}>{s.title}</h2>
              {s.paras?.map((p) => (
                <p key={p}>{p}</p>
              ))}
              {s.list && (
                <ul className="article__list">
                  {s.list.map((li) => (
                    <li key={li}>{li}</li>
                  ))}
                </ul>
              )}
              {s.items?.map((qa) => (
                <div key={qa.q} className="qa">
                  <h3>{qa.q}</h3>
                  {qa.a.map((p) => (
                    <p key={p}>{p}</p>
                  ))}
                </div>
              ))}
              {s.table && (
                <div className="article__table" role="region" aria-label={s.table.caption} tabIndex={0}>
                  <table>
                    <caption>{s.table.caption}</caption>
                    <thead>
                      <tr>
                        <td />
                        {s.table.cols.map((col) => (
                          <th key={col} scope="col">
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {s.table.rows.map((r) => (
                        <tr key={r.label}>
                          <th scope="row">{r.label}</th>
                          {r.cells.map((cell, i) => (
                            <td key={i}>{cell}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="note note--ink">{s.table.note}</p>
                </div>
              )}
            </section>
          ))}

          {page.sources && (
            <section className="article__section article__sources" aria-labelledby="sources-title">
              <h2 id="sources-title">{c.sourcesTitle}</h2>
              <ol>
                {page.sources.map((src) => (
                  <li key={src.href}>
                    <a href={src.href} rel="noopener" target="_blank">
                      {src.label}
                    </a>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>

        <section className="scene book" id="book" data-theme="yellow" aria-labelledby="book-title" tabIndex={-1}>
          <div className="wrap book__grid">
            <h2 className="mega book__title" id="book-title">
              {c.book.title}
            </h2>
            <div className="book__copy">
              <p className="lead">{c.book.body}</p>
              <div className="actions">
                <a className="btn btn--primary" href={mailto}>
                  {c.book.cta}
                </a>
                <a className="chev" href={mailto}>
                  {c.book.email}
                </a>
              </div>
              <p className="note note--ink">{c.book.pilot}</p>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter t={t} current={page.key} />
    </>
  );
}
