import type { SiteDict } from "@/content/site/types";
import { Icon } from "./Icon";
import { Phone } from "./Phone";

// Act 1 · hook. One composed scene: the vision line on the left, the opener on a student's
// phone on the right, and fragments of the same lesson floating at four depths around it.
export function Hero({ t, contactHref }: { t: SiteDict["hero"]; contactHref: string }) {
  return (
    <section className="hero" id="top" aria-labelledby="hero-title" data-hero>
      <div className="wrap hero__grid">
        <p className="hero__anchor" data-hero-intro>
          <span className="numeral hero__anchor-num">{t.anchor}</span>
          <span className="hero__anchor-label">{t.anchorLabel}</span>
        </p>

        <h1 id="hero-title" className="display display--xl hero__title" data-hero-title>
          {t.title}
        </h1>

        <div className="hero__copy">
          <p className="lead hero__deck" data-hero-intro>
            {t.deck}
          </p>
          <div className="hero__actions" data-hero-intro>
            <a className="btn btn--primary" href={contactHref} data-magnetic>
              <span className="btn__label">{t.cta}</span>
            </a>
            <a className="btn btn--ghost" href="#class">
              {t.secondary}
            </a>
          </div>
        </div>

        <div className="hero__stage">
          <div className="hero__layer hero__layer--bulb" aria-hidden="true" data-hero-depth="-1.6">
            <div data-pointer="0.25">
              <Icon name="bulb" size={200} className="hero__icon hero__icon--far" />
            </div>
          </div>

          <div className="hero__layer hero__layer--phone" data-hero-depth="0.6">
            <div data-pointer="0.55">
              <div data-hero-phone>
                <Phone screens={["vote"]} label={t.phoneAlt} className="hero__phone" />
              </div>
            </div>
          </div>

          <div className="hero__layer hero__layer--joined" aria-hidden="true" data-hero-depth="1.4">
            <div data-pointer="0.9">
              <div className="glass chip chip--joined" data-hero-chip>
                <span className="chip__row">
                  <span className="chip__meta">{t.chips.joined}</span>
                  <span className="chip__value">{t.chips.joinedCount}</span>
                </span>
                <span className="chip__track">
                  <span className="chip__fill" />
                </span>
              </div>
            </div>
          </div>

          <div className="hero__layer hero__layer--focus" aria-hidden="true" data-hero-depth="-0.6">
            <div data-pointer="0.4">
              <div className="glass chip chip--focus" data-hero-chip>
                <Icon name="shield" size={32} />
                <span>{t.chips.focus}</span>
              </div>
            </div>
          </div>

          <div className="hero__layer hero__layer--reason" aria-hidden="true" data-hero-depth="2.6">
            <div data-pointer="1.25">
              <div className="glass chip chip--reason" data-hero-chip>
                {t.chips.reason}
              </div>
            </div>
          </div>

          <div className="hero__layer hero__layer--scan" aria-hidden="true" data-hero-depth="3.2">
            <div data-pointer="1.5">
              <div data-hero-chip>
                <Icon name="scan" size={84} className="hero__icon hero__icon--near" />
              </div>
            </div>
          </div>
        </div>

        <ul className="hero__meta" data-hero-intro>
          {t.meta.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}
