import { Mark } from "@/components/app/Mark";
import type { SiteV2Dict } from "@/content/site-v2/types";

/*
  Placeholder screens, laid out like the real apps so the page reads true while they are built.
  Each carries an "Example" tag. They are swapped for real screenshots once the apps are done.

  The screens are pictures, so their titles are styled text, not headings: they never enter the
  page's outline. Every screen renders in its final state; the motion layer sets the earlier states itself and
  plays them through (the data-* hooks below), so without it each screen still reads complete.
*/

type S = SiteV2Dict["screens"];

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

/** The teacher app's Today screen: the prepared lessons and the last lesson's summary. */
export function ConsoleScreen({ s }: { s: S }) {
  const c = s.console;
  return (
    <div className="scr scr--console">
      <Side s={s} on={0} />
      <div className="scr-main">
        <p className="scr-greet">{c.greet}</p>
        <div className="scr-head">
          <p className="scr-h3">{c.title}</p>
          <span className="scr-btn scr-btn--yellow">{c.prepare}</span>
        </div>
        <ul className="scr-lessons">
          {c.lessons.map((l) => (
            <li key={l.course}>
              <span className="scr-lessons__text">
                <b>{l.course}</b>
                <span>
                  {l.topic} · {l.count}
                </span>
              </span>
              <span className="scr-btn scr-btn--ghost">{c.start}</span>
            </li>
          ))}
        </ul>
        <div className="scr-recent">
          <p className="scr-h4">{c.recentTitle}</p>
          <p className="scr-recent__row">
            {c.recent.map((r) => (
              <span key={r.label}>
                <b>{r.value}</b>
                {r.label}
              </span>
            ))}
          </p>
        </div>
      </div>
      <span className="scr-tag">{s.example}</span>
    </div>
  );
}

/** Prepare a lesson: the file, the line of emphasis, the AI's draft and the four refinements. */
export function PrepareScreen({ s }: { s: S }) {
  const p = s.prepare;
  return (
    <div className="scr scr--console" data-prep>
      <Side s={s} on={1} />
      <div className="scr-main scr-prep">
        <div className="scr-head">
          <p className="scr-h3">{p.title}</p>
          <span className="scr-chip">{p.course}</span>
        </div>
        <div className="scr-prep__in">
          <span className="scr-file" data-prep-file>
            <span className="scr-file__icon">PDF</span>
            {p.file}
          </span>
          <span className="scr-prep__emph" data-prep-emph>
            <small>{p.emphasisLabel}</small>
            {p.emphasis}
          </span>
        </div>
        <div className="scr-prep__out">
          <p className="scr-prep__writing" data-prep-writing>
            {p.writing}
            <span className="scr-prep__bar">
              <i data-prep-bar />
            </span>
          </p>
          <p className="scr-prep__count" data-prep-count>
            {p.count}
          </p>
          <ol className="scr-prep__qs">
            {p.questions.map((q) => (
              <li key={q.text} data-prep-q>
                <span>{q.text}</span>
                <small>{q.kind}</small>
              </li>
            ))}
          </ol>
        </div>
        <div className="scr-prep__foot">
          <span className="scr-prep__refine">
            {p.refine.map((r, i) => (
              <span key={r} className="scr-chip scr-chip--ghost" data-prep-refine={i === 1 ? "pick" : undefined}>
                {i === 1 && <i className="scr-chip__on" data-prep-on />}
                {r}
              </span>
            ))}
          </span>
          <span className="scr-btn scr-btn--yellow">{p.save}</span>
        </div>
      </div>
      <span className="scr-tag">{s.example}</span>
    </div>
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

/** The student app's answer screen, in its own blue and yellow. */
export function PhoneScreen({ s, lang }: { s: S; lang: "mk" | "en" }) {
  const p = s.phone;
  const keys = lang === "mk" ? KEYS : KEYS_EN;
  return (
    <div className="scr scr--phone">
      <p className="scr-phone__course">{p.course}</p>
      <p className="scr-phone__q">{p.question}</p>
      <ol className="scr-phone__answers">
        {p.answers.map((a, i) => (
          <li key={a} className={i === 1 ? "is-picked" : undefined}>
            <span>{keys[i]}</span>
            {a}
          </li>
        ))}
      </ol>
      <span className="scr-btn scr-btn--yellow scr-phone__send">{p.send}</span>
    </div>
  );
}
