import type { SiteDict } from "@/content/site/types";
import { CopyEmail } from "./CopyEmail";

export function mailto(t: SiteDict["contact"]) {
  return `mailto:${t.email}?subject=${encodeURIComponent(t.subject)}&body=${encodeURIComponent(t.mailBody)}`;
}

// Act 3 · climax. The largest gesture on the page names exactly what happens next.
export function Contact({ t }: { t: SiteDict["contact"] }) {
  return (
    <section id="contact" tabIndex={-1} className="section contact" aria-labelledby="contact-title">
      <div className="contact__bloom" aria-hidden="true" data-contact-bloom />
      <div className="wrap contact__inner">
        <p className="kicker" data-reveal>
          <span className="kicker__index">{t.index}</span>
          <span>{t.kicker}</span>
        </p>
        <h2 id="contact-title" className="display display--xl contact__title" data-split>
          {t.title}
        </h2>
        <p className="lead contact__body" data-reveal>
          {t.body}
        </p>
        <div className="contact__actions" data-reveal>
          <a className="btn btn--primary btn--lg" href={mailto(t)} data-magnetic>
            <span className="btn__label">{t.cta}</span>
          </a>
          <div className="contact__email">
            <a className="link" href={`mailto:${t.email}`}>
              {t.email}
            </a>
            <CopyEmail email={t.email} copy={t.copy} copied={t.copied} />
          </div>
        </div>
        <p className="note contact__pilot" data-reveal>
          {t.pilot}
        </p>
      </div>
    </section>
  );
}

// Epilogue. Quiet and well set.
export function Footer({ t, contact, nav }: { t: SiteDict["footer"]; contact: SiteDict["contact"]; nav: SiteDict["nav"] }) {
  return (
    <footer className="footer">
      <div className="wrap footer__grid">
        <p className="wordmark footer__mark">
          Teacher<span>Aid</span>
        </p>
        <p className="footer__line">{t.line}</p>
        <ul className="footer__links">
          <li>
            <a className="link" href={`mailto:${contact.email}`}>
              {contact.email}
            </a>
          </li>
          <li>
            <a className="link" href={nav.switchHref} hrefLang={nav.switchHref === "/" ? "mk" : "en"}>
              {nav.switchLabel}
            </a>
          </li>
        </ul>
        <p className="meta footer__made">{t.made}</p>
        <p className="meta footer__rights">{t.rights}</p>
      </div>
    </footer>
  );
}
