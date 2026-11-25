import { ArrowRightIcon } from "@phosphor-icons/react/ssr";
import { chrome, pageOrder, pagePaths, pages } from "@/content/site-v2/pages";
import type { SiteV2Dict } from "@/content/site-v2/types";

/**
 * The reading pages, listed in the home page's own body: a reader who wants more before booking
 * finds the answers here, and search engines find the pages from the page that matters most.
 */
export function ReadMore({ t }: { t: SiteV2Dict }) {
  const c = chrome[t.lang];
  return (
    <section className="scene more" id="more" data-theme="paper" aria-labelledby="more-title">
      <div className="wrap">
        <p className="kicker" data-reveal>
          {c.readMore.kicker}
        </p>
        <h2 className="display display--ink more__title" id="more-title" data-reveal>
          {c.readMore.title}
        </h2>
        <ul className="more__list">
          {pageOrder.map((key) => {
            const p = pages[key][t.lang];
            return (
              <li key={key} data-reveal>
                <a href={pagePaths[key][t.lang]}>
                  <span className="more__name">{p.name}</span>
                  <span className="more__lead">{p.lead}</span>
                  <ArrowRightIcon className="more__arrow" size={24} weight="bold" aria-hidden="true" />
                </a>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
