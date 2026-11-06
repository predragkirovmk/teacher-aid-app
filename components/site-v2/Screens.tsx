import { Mark } from "@/components/app/Mark";
import type { SiteV2Dict } from "@/content/site-v2/types";

/*
  The devices' screens. Where an app has the screen, it is a capture of the real app (Shot, from
  scripts/site-v2-capture.mjs). Where the teacher app has not built it yet (the live console, the
  class view, the end of a lesson, a class's page, the director's report), it is drawn here, laid
  out like the app will be and tagged "Example"; each is replaced by a capture once the app has it.

  The drawn screens are pictures, so their titles are styled text, not headings: they never enter
  the page's outline. Every screen renders in its final state; the motion layer sets the earlier states itself and
  plays them through (the data-* hooks below), so without it each screen still reads complete.
*/

type S = SiteV2Dict["screens"];

// The captures' sizes: teacher screens are the laptop's 16:10, student screens the phone's screen
// under its status bar (390x798).
const SHOTS = {
  t: { widths: [960, 1800], w: 1800, h: 1125 },
  s: { widths: [420, 780], w: 780, h: 1596 },
} as const;

/**
 * A student capture in a phone: the status bar's strip in the app's own top colour, the capture
 * under it. Data attributes go on the frame, so the motion layer can crossfade whole screens.
 */
export function PhoneShot({
  name,
  lang,
  sizes,
  top = "#1a5dae",
  eager = false,
  ...data
}: { name: string; lang: "mk" | "en"; sizes: string; top?: string; eager?: boolean } & Record<`data-${string}`, string | boolean>) {
  return (
    <div className="phone-shot" style={{ "--top": top } as React.CSSProperties} {...data}>
      <Shot name={name} lang={lang} sizes={sizes} eager={eager} />
    </div>
  );
}

/** A capture of the real app, in the page's language, at the width the device needs. */
export function Shot({
  name,
  lang,
  sizes,
  eager = false,
  className = "",
  ...data
}: {
  name: string;
  lang: "mk" | "en";
  sizes: string;
  eager?: boolean;
  className?: string;
} & Record<`data-${string}`, string | boolean>) {
  const k = SHOTS[name[0] as "t" | "s"];
  const src = (w: number) => `/site-v2/screens/${name}-${lang}-${w}.webp`;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- static captures with their own srcset; no optimiser needed
    <img
      className={`shot ${className}`}
      src={src(k.widths[0])}
      srcSet={k.widths.map((w) => `${src(w)} ${w}w`).join(", ")}
      sizes={sizes}
      width={k.w}
      height={k.h}
      alt=""
      decoding="async"
      loading={eager ? "eager" : "lazy"}
      fetchPriority={eager ? "high" : undefined}
      {...data}
    />
  );
}

const KEYS = ["А", "Б", "В", "Г"];
const KEYS_EN = ["A", "B", "C", "D"];

// Illustrative answer shares for the board: the right answer (index 1) leads, as in a real class.
const SHARES = [12, 62, 17, 9];

/** The teacher app's sidebar: the four places, one of them current. */
function Side({ s, on }: { s: S; on: number }) {
  return (
    <aside className="scr-side">
      <span className="scr-side__brand">
        <Mark size={18} />
        TeacherAid
      </span>
      <ul>
        {s.console.nav.map((label, i) => (
          <li key={label} className={i === on ? "is-on" : undefined}>
            <span className="scr-dot" />
            {label}
          </li>
        ))}
      </ul>
    </aside>
  );
}

/** The live console on the teacher's laptop: the questions to send and who is in and answering. */
export function LiveConsoleScreen({ s }: { s: S }) {
  const l = s.live;
  return (
    <div className="scr scr--live" data-console>
      <div className="scr-live__bar">
        <span>
          <b>{l.course}</b> · {l.state}
        </span>
        <span className="scr-btn scr-btn--end">{l.end}</span>
      </div>
      <div className="scr-live__body">
        <ol className="scr-live__qs">
          {l.questions.map((q, i) => (
            <li key={q} className={i === 0 ? "is-current" : undefined} data-send-row={i === 0 || undefined}>
              <span>{q}</span>
              {i === 0 ? (
                <span className="scr-btn scr-btn--yellow scr-send" data-send>
                  <span data-send-label>{l.send}</span>
                  <span data-sent-label>{l.sent}</span>
                </span>
              ) : (
                <span className="scr-btn scr-btn--ghost">{l.send}</span>
              )}
            </li>
          ))}
        </ol>
        <aside className="scr-live__side">
          <p>
            {l.joined}
            <span>
              <b data-c-joined>27</b> {l.of}
            </span>
          </p>
          <p>
            {l.answered}
            <span>
              <b data-c-answered>24</b> {l.of}
            </span>
          </p>
          <span className="scr-btn scr-btn--ghost scr-reveal" data-reveal-btn>
            <i data-reveal-fill />
            <span>{l.reveal}</span>
          </span>
        </aside>
      </div>
      <span className="scr-tag">{s.example}</span>
    </div>
  );
}

// A QR-like pattern for the board's join screen: drawn, not encoded, so it cannot be scanned.
const QR_SIZE = 21;
function finder(x: number, y: number) {
  for (const [fx, fy] of [
    [0, 0],
    [14, 0],
    [0, 14],
  ]) {
    const dx = x - fx;
    const dy = y - fy;
    if (dx >= 0 && dx < 7 && dy >= 0 && dy < 7) {
      const ring = Math.max(Math.abs(dx - 3), Math.abs(dy - 3));
      return ring === 3 || ring <= 1 ? 1 : 0;
    }
  }
  return -1;
}
function FakeQr() {
  const cells: React.ReactNode[] = [];
  for (let y = 0; y < QR_SIZE; y++) {
    for (let x = 0; x < QR_SIZE; x++) {
      const f = finder(x, y);
      const on = f === -1 ? (x * 7 + y * 13 + ((x * y) % 5)) % 3 === 0 : f === 1;
      if (on) cells.push(<rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" />);
    }
  }
  return (
    <svg viewBox={`-1 -1 ${QR_SIZE + 2} ${QR_SIZE + 2}`} aria-hidden="true">
      <rect x="-1" y="-1" width={QR_SIZE + 2} height={QR_SIZE + 2} fill="#fff" />
      <g fill="#0a2e37">{cells}</g>
    </svg>
  );
}

/** The projected class view: the join screen, then the question, the timer and the answer bars. */
export function BoardScreen({ s, lang }: { s: S; lang: "mk" | "en" }) {
  const b = s.board;
  const keys = lang === "mk" ? KEYS : KEYS_EN;
  return (
    <div className="scr scr--board" data-board>
      <div className="scr-board__lobby" data-board-lobby>
        <span className="scr-qr">
          <FakeQr />
        </span>
        <span className="scr-lobby">
          <span className="scr-lobby__scan">{b.lobby.scan}</span>
          <span className="scr-lobby__code">{b.lobby.code}</span>
          <span className="scr-lobby__joined">
            <b data-joined>{b.lobby.joined}</b> {b.lobby.of}
          </span>
        </span>
      </div>
      {/* Two columns: the question and its answers on the left, the clock and the count on the
          right. The bottom right stays clear, where the teacher's laptop stands in front. */}
      <div className="scr-board__q" data-board-q>
        <div className="scr-board__top">
          <span>{b.course}</span>
          <span>{b.progress}</span>
        </div>
        <div className="scr-board__side">
          <span className="scr-timer" data-timer>
            {b.timer}
          </span>
          <p className="scr-board__count">
            <b data-answered>{b.answered.n}</b> {b.answered.of}
          </p>
        </div>
        <p className="scr-board__question" data-board-question>
          {b.question}
        </p>
        <ol className="scr-bars">
          {b.answers.map((a, i) => (
            <li key={a} className={i === 1 ? "is-right" : undefined} data-bar style={{ "--share": SHARES[i] / 100 } as React.CSSProperties}>
              {i === 1 && <span className="scr-bars__ring" data-ring />}
              <span className="scr-bars__key">{keys[i]}</span>
              <span className="scr-bars__label">{a}</span>
              <span className="scr-bars__fill" data-bar-fill />
              <span className="scr-bars__pct" data-bar-pct>
                {SHARES[i]}%
              </span>
            </li>
          ))}
        </ol>
      </div>
      <span className="scr-tag">{s.example}</span>
    </div>
  );
}

/** After End: the attendance for e-Dnevnik and the questions the class got wrong most. */
export function EndScreen({ s }: { s: S }) {
  const e = s.end;
  return (
    <div className="scr scr--console" data-end>
      <Side s={s} on={1} />
      <div className="scr-main scr-end">
        <div className="scr-head">
          <div>
            <p className="scr-h3">{e.title}</p>
            <small className="scr-sub">{e.course}</small>
          </div>
          <span className="scr-btn scr-btn--yellow">{e.copy}</span>
        </div>
        <p className="scr-end__stats">
          {e.stats.map((st) => (
            <span key={st.label} data-end-stat>
              <b data-end-n={st.n}>{st.n}</b>
              {st.label}
            </span>
          ))}
        </p>
        <div className="scr-end__missed">
          <p className="scr-h4">{e.missedTitle}</p>
          <ol>
            {e.missed.map((m) => (
              <li key={m.text} data-end-row style={{ "--share": m.pct / 100 } as React.CSSProperties}>
                <span className="scr-meter" data-end-fill />
                <span>{m.text}</span>
                <b>
                  {m.pct}% {e.missedUnit}
                </b>
              </li>
            ))}
          </ol>
        </div>
        <span className="scr-btn scr-btn--ghost scr-end__practice">{e.practice}</span>
      </div>
      <span className="scr-tag">{s.example}</span>
    </div>
  );
}

/** One class on one page: attendance per lesson, topics to go over, the anonymous questions. */
export function ResultsScreen({ s }: { s: S }) {
  const r = s.results;
  return (
    <div className="scr scr--console" data-results>
      <Side s={s} on={2} />
      <div className="scr-main scr-res">
        <div className="scr-head">
          <p className="scr-h3">{r.title}</p>
        </div>
        <div className="scr-res__chart">
          <p className="scr-h4">{r.attendanceLabel}</p>
          <span className="scr-res__bars">
            {r.attendance.map((v, i) => (
              <i key={i} data-res-bar style={{ "--v": v / 100 } as React.CSSProperties} />
            ))}
          </span>
        </div>
        <div className="scr-res__cols">
          <div>
            <p className="scr-h4">{r.weakTitle}</p>
            <ol>
              {r.weak.map((w) => (
                <li key={w.topic} data-res-row style={{ "--share": w.pct / 100 } as React.CSSProperties}>
                  <span className="scr-meter scr-meter--ok" data-res-fill />
                  <span>{w.topic}</span>
                  <b>
                    {w.pct}% {r.weakUnit}
                  </b>
                </li>
              ))}
            </ol>
          </div>
          <div>
            <p className="scr-h4">{r.askedTitle}</p>
            <ul>
              {r.asked.map((a) => (
                <li key={a} data-res-row>
                  {a}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
      <span className="scr-tag">{s.example}</span>
    </div>
  );
}

/**
 * The director's monthly PDF, drawn: page one is written to be forwarded as it is, page two is for
 * the director only. Each sheet is A4 and a size container, so its type scales with it.
 */
export function ReportSheets({ s, lang }: { s: S; lang: "mk" | "en" }) {
  const r = s.report;
  const num = (n: number) => n.toLocaleString(lang === "mk" ? "mk-MK" : "en-GB");
  const peak = Math.max(...r.trend);
  const head = (page: string) => (
    <div className="sheet__head">
      <span className="sheet__brand">
        <Mark size={16} />
        TeacherAid
      </span>
      <span className="sheet__page">{page}</span>
    </div>
  );
  return (
    <>
      <div className="sheet" data-sheet="1">
        <div className="sheet__in">
          {head(r.page1)}
          <p className="sheet__title">{r.title}</p>
          <p className="sheet__school">{r.school}</p>
          <p className="sheet__summary">{r.summary}</p>
          <div className="sheet__stats">
            {r.stats.map((st) => (
              <p key={st.label} className="sheet__stat">
                <span className="sheet__label">{st.label}</span>
                <span className="sheet__n">
                  <b data-report-n={st.n}>{num(st.n)}</b>
                  {st.unit}
                  {st.of && <small> {st.of}</small>}
                </span>
                <span className="sheet__delta">{st.delta}</span>
              </p>
            ))}
          </div>
          <div className="sheet__trend">
            <p className="sheet__label">{r.trendLabel}</p>
            <span className="sheet__bars">
              {r.trend.map((v, i) => (
                // The last four weeks are this month.
                <i key={i} className={i >= r.trend.length - 4 ? "is-now" : undefined} data-report-bar style={{ "--v": v / peak } as React.CSSProperties} />
              ))}
            </span>
          </div>
          <div className="sheet__cols">
            <div>
              <p className="sheet__label">{r.topClassesTitle}</p>
              <ol>
                {r.topClasses.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ol>
            </div>
            <div>
              <p className="sheet__label">{r.topTeachersTitle}</p>
              <ol>
                {r.topTeachers.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ol>
            </div>
          </div>
          <p className="sheet__foot">{r.noNames}</p>
        </div>
        <span className="scr-tag sheet__tag">{s.example}</span>
      </div>

      <div className="sheet sheet--private" data-sheet="2">
        <div className="sheet__in">
          {head(r.page2)}
          <p className="sheet__title">{r.compareTitle}</p>
          <p className="sheet__school">{r.school}</p>
          <p className="sheet__key">
            <span className="is-you">{r.you}</span>
            <span>{r.avg}</span>
          </p>
          <div className="sheet__compare">
            {r.compare.map((c) => {
              const top = Math.max(c.you, c.avg);
              return (
                <div key={c.label} className="sheet__pair">
                  <p className="sheet__label">{c.label}</p>
                  {[c.you, c.avg].map((v, i) => (
                    <span key={i} className={`sheet__meter${i === 0 ? " is-you" : ""}`}>
                      <i data-report-meter style={{ "--v": v / top } as React.CSSProperties} />
                      <b>
                        {num(v)}
                        {c.unit}
                      </b>
                    </span>
                  ))}
                </div>
              );
            })}
          </div>
          <p className="sheet__note">{r.compareNote}</p>
          <p className="sheet__foot sheet__foot--private">{r.private}</p>
        </div>
      </div>
    </>
  );
}
