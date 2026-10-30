import { ArrowRightIcon } from "@phosphor-icons/react/ssr";
import type { SiteV2Dict } from "@/content/site-v2/types";
import { ClassStack } from "./ClassStack";
import { Board, Laptop, Phone } from "./Devices";
import { Motion } from "./Motion";
import { Nav } from "./Nav";
import {
  AnswerScreen,
  BoardScreen,
  ConsoleScreen,
  EndScreen,
  LiveConsoleScreen,
  PhoneScreen,
  PrepareScreen,
  ResultsScreen,
  ScanScreen,
} from "./Screens";

/*
  The page, server-rendered and complete without JavaScript. Motion adds itself on top.
  Acts follow the brief in docs/site-v2/DESIGN.md: hook (hero), build (the teacher chapter),
  climax (in class), epilogue (booking and footer).
*/
export function SitePageV2({ t }: { t: SiteV2Dict }) {
  const s = t.screens;
  const mailto = `mailto:${t.book.email}`;

  return (
    <>
      <Nav t={t.nav} ctaHref="#book" />

      <main id="main" tabIndex={-1}>
        {/* Act 1, hook: the claim in one line, then the scene that proves it. The motion layer
            pins this section: the one phone is joined by the whole class, and every student answers. */}
        <section className="hero" id="top" data-theme="paper" data-hero aria-labelledby="hero-title">
          <div className="wrap hero__grid">
            <p className="kicker hero__kicker" data-hero-out>
              {t.hero.kicker}
            </p>
            <h1 className="mega hero__title" id="hero-title" data-hero-title>
              {t.hero.title.map((line, i) => (
                <span className="line" key={line} style={{ "--i": i } as React.CSSProperties}>
                  <span>{line}</span>
                </span>
              ))}
            </h1>
            <div className="hero__deck" data-hero-out>
              <p className="lead">{t.hero.deck}</p>
              <div className="actions">
                <a className="btn btn--primary" href="#book">
                  {t.hero.cta}
                </a>
                <a className="chev" href="#teacher">
                  {t.hero.secondary}
                  <ArrowRightIcon size={18} weight="bold" aria-hidden="true" />
                </a>
              </div>
              <ul className="hero__meta">
                {t.hero.meta.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            </div>
          </div>

          <div className="wrap hero__stage">
            <Laptop label={s.alt.console} className="hero__laptop">
              <ConsoleScreen s={s} />
            </Laptop>
            <Phone label={s.alt.phone} className="hero__phone">
              <PhoneScreen s={s} lang={t.lang} />
            </Phone>
          </div>

          {/* Where the scene ends, laid out in CSS; the motion layer measures it. */}
          <div className="hero__end">
            <span className="hero__title-end" data-hero-title-end aria-hidden="true" />
            <p className="hero__count" data-hero-count aria-hidden="true">
              <b data-count>1</b>
              <span>
                {t.hero.class.of}
                <br />
                {t.hero.class.label}
              </span>
            </p>
            <span className="hero__desk" data-hero-desk />
            <ClassStack label={t.hero.class.alt} />
          </div>
        </section>

        {/* Act 2, build: the teacher chapter, the page's one deep-teal moment. */}
        <div className="chapter" id="teacher" data-theme="teal" tabIndex={-1}>
          <section className="scene opener" aria-labelledby="teacher-title">
            <div className="wrap">
              <p className="kicker kicker--on-teal" data-reveal>
                {t.teacher.label}
              </p>
              <h2 className="display" id="teacher-title" data-reveal>
                {t.teacher.title}
              </h2>
              <p className="lead opener__body" data-reveal>
                {t.teacher.body}
              </p>
            </div>
            <div className="wrap opener__stage">
              <Laptop label={s.alt.console} className="opener__laptop">
                <ConsoleScreen s={s} />
              </Laptop>
            </div>
          </section>

          <section className="scene split" id={t.prepare.id} aria-labelledby="prepare-title" tabIndex={-1}>
            <div className="wrap scene__head">
              <p className="index" data-reveal>
                <span>{t.prepare.index}</span> {t.prepare.label}
              </p>
              <h2 className="display" id="prepare-title" data-reveal>
                {t.prepare.title}
              </h2>
            </div>
            <div className="wrap split__grid">
              <div className="split__copy">
                <p className="body" data-reveal>
                  {t.prepare.body}
                </p>
                <div className="refine" data-reveal>
                  <p className="refine__label">{t.prepare.refineLabel}</p>
                  <ul>
                    {t.prepare.refinements.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                </div>
                <p className="note" data-reveal>
                  {t.prepare.kinds}
                </p>
              </div>
              <div className="split__media" data-reveal>
                <Laptop label={s.alt.prepare}>
                  <PrepareScreen s={s} />
                </Laptop>
              </div>
            </div>
          </section>

          {/* Act 2, climax: the laptop and the board in sync. The motion layer pins the stage and
              plays the lesson through: students join, one click sends the question from the
              laptop to the board, the answers come in, the right one is revealed. */}
          <section className="scene live" id={t.live.id} aria-labelledby="live-title" tabIndex={-1}>
            <div className="wrap">
              <p className="index" data-reveal>
                <span>{t.live.index}</span> {t.live.label}
              </p>
              <h2 className="display" id="live-title" data-reveal>
                {t.live.title}
              </h2>
              <p className="lead live__lead" data-reveal>
                {t.live.body}
              </p>
              <div className="live__pin" data-live>
                <ol className="live__steps">
                  {t.live.steps.map((step, i) => (
                    <li key={step} data-step>
                      <span>{String(i + 1).padStart(2, "0")}</span>
                      {step}
                    </li>
                  ))}
                </ol>
                <div className="live__stage">
                  <Board label={s.alt.live} className="live__board">
                    <BoardScreen s={s} lang={t.lang} />
                  </Board>
                  <Laptop className="live__laptop">
                    <LiveConsoleScreen s={s} />
                  </Laptop>
                  <p className="flycard" data-flycard aria-hidden="true">
                    <span className="flycard__bg" data-flycard-bg />
                    <span className="flycard__text">{s.board.question}</span>
                  </p>
                </div>
              </div>
              <div className="live__copy">
                <p className="note" data-reveal>
                  {t.live.join}
                </p>
                <p className="note" data-reveal>
                  {t.live.anonymous}
                </p>
              </div>
            </div>
          </section>

          <section className="scene split split--flip" id={t.after.id} aria-labelledby="after-title" tabIndex={-1}>
            <div className="wrap scene__head">
              <p className="index" data-reveal>
                <span>{t.after.index}</span> {t.after.label}
              </p>
              <h2 className="display" id="after-title" data-reveal>
                {t.after.title}
              </h2>
            </div>
            <div className="wrap split__grid">
              <div className="split__copy">
                <p className="body" data-reveal>
                  {t.after.body}
                </p>
                <p className="note" data-reveal>
                  {t.after.practice}
                </p>
                <p className="note note--quiet" data-reveal>
                  {t.after.note}
                </p>
              </div>
              <div className="split__media" data-reveal>
                <Laptop label={s.alt.end}>
                  <EndScreen s={s} />
                </Laptop>
              </div>
            </div>
          </section>
        </div>

        <section className="scene results split" id={t.results.id} data-theme="paper" aria-labelledby="results-title">
          <div className="wrap scene__head">
            <p className="index index--ink" data-reveal>
              <span>{t.results.index}</span> {t.results.label}
            </p>
            <h2 className="display display--ink" id="results-title" data-reveal>
              {t.results.title}
            </h2>
          </div>
          <div className="wrap split__grid">
            <div className="split__copy">
              <p className="body results__body" data-reveal>
                {t.results.body}
              </p>
            </div>
            <div className="split__media" data-reveal>
              <Laptop label={s.alt.results}>
                <ResultsScreen s={s} />
              </Laptop>
            </div>
          </div>
        </section>

        {/* Act 2 again, from the other side: the student chapter, in the student app's blue. */}
        <div className="chapter chapter--student" id="student" data-theme="blue" tabIndex={-1}>
          <section className="scene opener" aria-labelledby="student-title">
            <div className="wrap">
              <p className="kicker kicker--on-teal" data-reveal>
                {t.student.label}
              </p>
              <h2 className="display" id="student-title" data-reveal>
                {t.student.title}
              </h2>
              <p className="lead opener__body" data-reveal>
                {t.student.body}
              </p>
            </div>
          </section>

          <section className="scene split" id={t.scan.id} aria-labelledby="scan-title">
            <div className="wrap scene__head">
              <p className="index" data-reveal>
                <span>{t.scan.index}</span> {t.scan.label}
              </p>
              <h2 className="display" id="scan-title" data-reveal>
                {t.scan.title}
              </h2>
            </div>
            <div className="wrap split__grid">
              <div className="split__copy">
                <p className="body" data-reveal>
                  {t.scan.body}
                </p>
                <p className="note" data-reveal>
                  {t.scan.note}
                </p>
              </div>
              <div className="split__media scan__media" data-reveal>
                <Phone label={s.alt.scan} className="scan__phone">
                  <ScanScreen s={s} />
                </Phone>
              </div>
            </div>
          </section>

          {/* The student's climax: pinned, the answer plays through on one phone. */}
          <section className="scene answer" id={t.answer.id} aria-labelledby="answer-title">
            <div className="wrap">
              <p className="index" data-reveal>
                <span>{t.answer.index}</span> {t.answer.label}
              </p>
              <h2 className="display" id="answer-title" data-reveal>
                {t.answer.title}
              </h2>
              <p className="lead answer__lead" data-reveal>
                {t.answer.body}
              </p>
              <div className="answer__pin" data-answer-pin>
                <ol className="answer__steps">
                  {t.answer.steps.map((step, i) => (
                    <li key={step} data-ans-step>
                      <span>{String(i + 1).padStart(2, "0")}</span>
                      {step}
                    </li>
                  ))}
                </ol>
                <Phone label={s.alt.answer} className="answer__phone">
                  <AnswerScreen s={s} lang={t.lang} />
                </Phone>
              </div>
            </div>
          </section>
        </div>

        {/* Epilogue: the one thing to do next, the page's one field of yellow. */}
        <section className="scene book" id="book" data-theme="yellow" aria-labelledby="book-title" tabIndex={-1}>
          <div className="wrap book__grid">
            <h2 className="mega book__title" id="book-title" data-reveal>
              {t.book.title}
            </h2>
            <div className="book__copy">
              <p className="lead" data-reveal>
                {t.book.body}
              </p>
              <div className="actions" data-reveal>
                <a className="btn btn--primary" href={mailto}>
                  {t.book.cta}
                </a>
                <a className="chev" href={mailto}>
                  {t.book.email}
                </a>
              </div>
              <p className="note note--ink" data-reveal>
                {t.book.pilot}
              </p>
            </div>
          </div>
        </section>
      </main>

      <footer className="foot" data-theme="paper">
        <div className="wrap foot__row">
          <p>{t.footer.line}</p>
          <nav aria-label={t.footer.langLabel}>
            <ul>
              {t.footer.langs.map((l) => (
                <li key={l.href}>
                  <a href={l.href} hrefLang={l.lang} lang={l.lang} aria-current={l.lang === t.lang ? "page" : undefined}>
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </footer>

      <Motion />
    </>
  );
}
