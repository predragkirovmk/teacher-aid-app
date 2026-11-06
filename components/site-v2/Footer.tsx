import { chrome, homePaths, pageOrder, pagePaths, pages, type PageKey } from "@/content/site-v2/pages";
import type { SiteV2Dict } from "@/content/site-v2/types";

/**
 * The footer of every page: what TeacherAid is in one plain paragraph, links to every page, and
 * the language switch, which lands on the same page in the other language.
 */
export function SiteFooter({ t, current }: { t: SiteV2Dict; current: PageKey | "home" }) {
  const c = chrome[t.lang];
  const pathIn = (lang: SiteV2Dict["lang"]) => (current === "home" ? homePaths[lang] : pagePaths[current][lang]);

  return (
    <footer className="foot" data-theme="paper">
      <div className="wrap foot__grid">
        <p className="foot__about">{c.definition}</p>
        <nav aria-label={c.pagesLabel} className="foot__pages">
          <ul>
            {pageOrder.map((key) => (
              <li key={key}>
                <a href={pagePaths[key][t.lang]} aria-current={key === current ? "page" : undefined}>
                  {pages[key][t.lang].name}
                </a>
              </li>
            ))}
            <li>
              <a href={c.privacy.href}>{c.privacy.label}</a>
            </li>
            <li>
              <a href={`mailto:${c.book.email}`}>{c.book.email}</a>
            </li>
          </ul>
        </nav>
      </div>
      <div className="wrap foot__row">
        <p>{t.footer.line}</p>
        <nav aria-label={t.footer.langLabel}>
          <ul>
            {t.footer.langs.map((l) => (
              <li key={l.href}>
                <a href={pathIn(l.lang)} hrefLang={l.lang} lang={l.lang} aria-current={l.lang === t.lang ? "page" : undefined}>
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </footer>
  );
}
