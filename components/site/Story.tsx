import type { SiteDict } from "@/content/site/types";
import { Icon } from "./Icon";
import { Phone } from "./Phone";

const pad = (n: number) => String(n).padStart(2, "0");

function Kicker({ index, children }: { index: string; children: React.ReactNode }) {
  return (
    <p className="kicker" data-reveal>
      <span className="kicker__index">{index}</span>
      <span>{children}</span>
    </p>
  );
}

// Act 1 · the problem. The lines brighten word by word as they scroll past.
export function Problem({ t }: { t: SiteDict["problem"] }) {
  return (
    <section className="section problem" aria-labelledby="problem-title">
      <p className="problem__ghost" aria-hidden="true" data-depth="-3">
        08:00
      </p>
      <div className="wrap problem__inner">
        <Kicker index={t.index}>{t.kicker}</Kicker>
        <h2 id="problem-title" className="display display--l problem__lines">
          {t.lines.map((line, i) => (
            <span key={line} className="problem__line" data-scrub-words data-depth={String(0.4 + i * 0.5)}>
              {line}
            </span>
          ))}
        </h2>
        <p className="display display--m problem__answer" data-split>
          {t.answer}
        </p>
        <p className="note problem__note" data-reveal>
          {t.note}
        </p>
      </div>
    </section>
  );
}

// Act 2 · build. The centrepiece: the section pins and the lesson clock runs from 00 to 45
// while the phone steps through the student's side of one real lesson.
export function Lesson({ t }: { t: SiteDict["lesson"] }) {
  return (
    <section id="class" tabIndex={-1} className="section lesson" aria-labelledby="lesson-title" data-lesson>
      <div className="wrap lesson__intro">
        <Kicker index={t.index}>{t.kicker}</Kicker>
        <h2 id="lesson-title" className="display display--l" data-split>
          {t.title}
        </h2>
      </div>

      <div className="lesson__pin" data-lesson-pin>
        <div className="lesson__ice" aria-hidden="true" data-lesson-ice />
        <div className="wrap lesson__stage">
          <div className="lesson__clock" aria-hidden="true">
            <svg className="ring" viewBox="0 0 200 200">
              <circle className="ring__track" cx="100" cy="100" r="92" />
              <circle className="ring__arc" cx="100" cy="100" r="92" pathLength={1} data-ring-arc />
              <g className="ring__knob-arm" data-ring-knob>
                <circle className="ring__knob" cx="100" cy="8" r="6" />
              </g>
            </svg>
            <p className="lesson__minute">
              <span className="numeral lesson__minute-num" data-minute>
                {pad(t.steps[0].minute)}
              </span>
              <span className="lesson__minute-unit">{t.minute}</span>
            </p>
          </div>

          <ol className="lesson__captions">
            {t.steps.map((s, i) => (
              <li
                key={s.minute}
                className={`lesson__caption${i === 0 ? " is-active" : ""}`}
                data-step={i}
                data-minute={s.minute}
                data-ice={s.ice ? "true" : undefined}
              >
                <p className="lesson__caption-minute">
                  {pad(s.minute)} {t.minute}
                </p>
                <h3 className="display display--m">{s.title}</h3>
                <p className="lead">{s.body}</p>
              </li>
            ))}
          </ol>

          <div className="lesson__device">
            <div className="lesson__icons" aria-hidden="true">
              {t.steps.map((s, i) => (
                <div key={s.minute} className={`lesson__icon${i === 0 ? " is-active" : ""}`} data-step-icon={i}>
                  <Icon name={s.icon} size={220} />
                </div>
              ))}
            </div>
            <div className="lesson__phone" data-lesson-phone>
              <Phone screens={t.steps.map((s) => s.screen)} label={t.kicker} active={0} />
            </div>
          </div>

          <div className="lesson__ticks" role="group" aria-label={t.stepsLabel}>
            {t.steps.map((s, i) => (
              <button
                key={s.minute}
                type="button"
                className={`lesson__tick${i === 0 ? " is-active" : ""}`}
                data-step-go={i}
                aria-label={`${pad(s.minute)} ${t.minute} · ${s.title}`}
                aria-pressed={i === 0}
              >
                {pad(s.minute)}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// Act 2 · the pedagogy, on the first ice sheet.
export function Why({ t }: { t: SiteDict["why"] }) {
  return (
    <section id="why" tabIndex={-1} className="section sheet why" aria-labelledby="why-title" data-sheet>
      <div className="sheet__bg" aria-hidden="true">
        <span className="sheet__depth" data-depth="-1.4">
          <span className="sheet__bloom sheet__bloom--a" />
        </span>
        <span className="sheet__depth" data-depth="1.2">
          <span className="sheet__bloom sheet__bloom--b" />
        </span>
      </div>
      <div className="wrap why__grid">
        <div className="why__text">
          <Kicker index={t.index}>{t.kicker}</Kicker>
          <h2 id="why-title" className="display display--l" data-split>
            {t.title}
          </h2>
          <p className="lead" data-reveal>
            {t.body}
          </p>
        </div>

        <div className="why__points">
          {t.points.map((p, i) => (
            <p key={p.value} className={`why__point why__point--${i ? "b" : "a"}`} data-why-point={i}>
              <span className="numeral why__point-num">{p.value}</span>
              <span className="why__point-label">{p.label}</span>
            </p>
          ))}
        </div>

        <ol className="why__research">
          {t.research.map((r, i) => (
            <li key={r.name} className="why__item" data-reveal>
              <span className="why__n">{pad(i + 1)}</span>
              <h3 className="why__name">{r.name}</h3>
              <p className="why__finding">{r.finding}</p>
              <p className="meta why__cite">{r.cite}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

// Act 2 · the teacher's side: what goes in, what comes out.
export function Teacher({ t }: { t: SiteDict["teacher"] }) {
  return (
    <section id="teacher" tabIndex={-1} className="section teacher" aria-labelledby="teacher-title">
      <div className="wrap teacher__grid">
        <div className="teacher__text">
          <Kicker index={t.index}>{t.kicker}</Kicker>
          <h2 id="teacher-title" className="display display--l" data-split>
            {t.title}
          </h2>
          <p className="lead" data-reveal>
            {t.body}
          </p>

          <div className="teacher__refine" data-reveal>
            <p className="meta">{t.refineLabel}</p>
            <ul className="seg" data-seg>
              {t.refinements.map((r, i) => (
                <li key={r} className={`seg__option${i === 0 ? " is-on" : ""}`}>
                  {r}
                </li>
              ))}
            </ul>
          </div>

          <div className="teacher__types" data-reveal>
            <p className="meta">{t.typesLabel}</p>
            <p className="teacher__types-list">{t.types.join(" · ")}</p>
          </div>

          <p className="note teacher__note" data-reveal>
            {t.note}
          </p>
        </div>

        <div className="teacher__flow">
          <article className="glass card card--input" data-depth="0.4" data-card>
            <p className="meta">{t.inputLabel}</p>
            <p className="card__title" data-type>
              {t.input.subject}
            </p>
            <p className="card__line" data-type>
              {t.input.topic}
            </p>
            <p className="card__line card__line--soft" data-type>
              {t.input.focus}
            </p>
          </article>

          <p className="meta teacher__out-label" data-reveal>
            {t.outputLabel}
          </p>

          <article className="tile-ice card card--opener" data-depth="1.2" data-card>
            <p className="meta card__meta-ice">{t.opener.label}</p>
            <p className="card__opener">{t.opener.text}</p>
          </article>

          {t.outputs.map((o, i) => (
            <article key={o.title} className="glass card" data-depth={String(1.6 + i * 0.6)} data-card>
              <p className="card__title">{o.title}</p>
              <p className="card__line card__line--soft">{o.body}</p>
            </article>
          ))}
        </div>

        <div className="teacher__phone" data-depth="2.4">
          <Phone screens={["numeric"]} label={t.phoneAlt} />
        </div>
      </div>
    </section>
  );
}

// Act 2 · the headmaster's side, on the second ice sheet.
export function Report({ t }: { t: SiteDict["report"] }) {
  const s = t.sample;
  return (
    <section id="report" tabIndex={-1} className="section sheet report" aria-labelledby="report-title" data-sheet>
      <div className="sheet__bg" aria-hidden="true">
        <span className="sheet__depth" data-depth="1.2">
          <span className="sheet__bloom sheet__bloom--a" />
        </span>
        <span className="sheet__depth" data-depth="-1.6">
          <span className="sheet__bloom sheet__bloom--b" />
        </span>
      </div>
      <div className="wrap report__grid">
        <div className="report__text">
          <Kicker index={t.index}>{t.kicker}</Kicker>
          <h2 id="report-title" className="display display--l" data-split>
            {t.title}
          </h2>
          <p className="lead" data-reveal>
            {t.body}
          </p>
          <ul className="report__notes">
            {t.notes.map((n) => (
              <li key={n} data-reveal>
                <Icon name="check" tone="light" size={28} />
                <span>{n}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="report__stack" data-report>
          <div className="report__page report__page--back" aria-hidden="true" data-report-back />
          <div className="report__page report__page--prev" aria-hidden="true" data-report-prev>
            <p className="meta">{s.older[0]}</p>
          </div>
          <article className="report__page report__page--current" data-report-current aria-label={`${s.month} · ${t.disclaimer}`}>
            <header className="report__head">
              <p className="report__brand">
                Teacher<span>Aid</span>
              </p>
              <p className="report__tag">{s.tag}</p>
            </header>
            <p className="report__month">{s.month}</p>
            <dl className="report__figures">
              {s.figures.map((f) => (
                <div key={f.label} className="report__figure">
                  <dt className="meta">{f.label}</dt>
                  <dd>
                    <span className="numeral report__num" data-count-text>
                      {f.value}
                    </span>
                    {f.unit ? <span className="report__unit">{f.unit}</span> : null}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="report__trend">{s.trend}</p>
            <div className="report__rows">
              <p className="meta">{s.classesLabel}</p>
              <p className="report__classes">{s.classes}</p>
              <p className="meta">{s.summaryLabel}</p>
              <p className="report__summary">{s.summary}</p>
            </div>
            <p className="meta report__disclaimer">{t.disclaimer}</p>
          </article>
        </div>
      </div>
    </section>
  );
}

// Act 2 · trust: the phone rule and the data rules.
export function Trust({ t }: { t: SiteDict["trust"] }) {
  return (
    <section id="privacy" tabIndex={-1} className="section trust" aria-labelledby="trust-title">
      <div className="wrap trust__grid">
        <div className="trust__lead">
          <Kicker index={t.index}>{t.kicker}</Kicker>
          <h2 id="trust-title" className="display display--l" data-split>
            {t.title}
          </h2>
          <p className="lead" data-reveal>
            {t.focus}
          </p>
          <p className="trust__policy" data-reveal>
            {t.policy} <span className="meta">{t.policySource}</span>
          </p>

          <div className="trust__offline">
            <div className="trust__phone" data-depth="1.8">
              <Phone screens={["offline"]} label={t.phoneAlt} />
            </div>
            <div className="trust__offline-text" data-reveal>
              <p className="card__title">{t.offlineTitle}</p>
              <p className="card__line card__line--soft">{t.offlineBody}</p>
            </div>
          </div>
        </div>

        <ul className="trust__list">
          {t.items.map((item, i) => (
            <li key={item.title} data-depth={String(i * 0.15)}>
              <div className="glass trust__item" data-reveal>
                <Icon name={item.icon} size={44} className="trust__icon" />
                <div>
                  <h3 className="card__title">{item.title}</h3>
                  <p className="card__line card__line--soft">{item.body}</p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function formatNumber(n: number, lang: "mk" | "en") {
  const digits = String(n);
  if (n < 1000) return digits;
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, lang === "mk" ? " " : ",");
  return grouped;
}

// Act 3 · the country, in one sentence of numbers.
export function Country({ t, lang }: { t: SiteDict["country"]; lang: "mk" | "en" }) {
  return (
    <section className="section country" aria-labelledby="country-title">
      <div className="wrap country__inner">
        <Kicker index={t.index}>{t.kicker}</Kicker>
        <h2 id="country-title" className="country__figures">
          {t.figures.map((f, i) => (
            <span key={f.label} className="country__figure" data-drift={String(i % 2 ? 1 : -1)}>
              {f.prefix ? <span className="country__prefix">{f.prefix} </span> : null}
              <span className="numeral country__num" data-count={f.value} data-count-lang={lang}>
                {formatNumber(f.value, lang)}
              </span>{" "}
              <span className="country__label">{f.label}.</span>
            </span>
          ))}
        </h2>
        <p className="display display--m country__tail" data-split>
          {t.tail}
        </p>
        <p className="lead country__closing" data-reveal>
          {t.closing}
        </p>
        <p className="note" data-reveal>
          {t.source}
        </p>
      </div>
    </section>
  );
}
