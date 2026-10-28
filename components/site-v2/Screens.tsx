import { Mark } from "@/components/app/Mark";
import type { SiteV2Dict } from "@/content/site-v2/types";

/*
  Placeholder screens, laid out like the real apps so the page reads true while they are built.
  Each carries an "Example" tag. They are swapped for real screenshots once the apps are done.
*/

type S = SiteV2Dict["screens"];

const KEYS = ["А", "Б", "В", "Г"];
const KEYS_EN = ["A", "B", "C", "D"];

// Illustrative answer shares for the board: the right answer (index 1) leads, as in a real class.
const SHARES = [12, 62, 17, 9];

/** The teacher app's Today screen: the teal sidebar with four places and the prepared lessons. */
export function ConsoleScreen({ s }: { s: S }) {
  const c = s.console;
  return (
    <div className="scr scr--console">
      <aside className="scr-side">
        <span className="scr-side__brand">
          <Mark size={18} />
          TeacherAid
        </span>
        <ul>
          {c.nav.map((label, i) => (
            <li key={label} className={i === 0 ? "is-on" : undefined}>
              <span className="scr-dot" />
              {label}
            </li>
          ))}
        </ul>
      </aside>
      <div className="scr-main">
        <p className="scr-greet">{c.greet}</p>
        <div className="scr-head">
          <h3>{c.title}</h3>
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
          <h4>{c.recentTitle}</h4>
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

/** The projected class view: one question, the timer, the answer bars. */
export function BoardScreen({ s, lang }: { s: S; lang: "mk" | "en" }) {
  const b = s.board;
  const keys = lang === "mk" ? KEYS : KEYS_EN;
  return (
    <div className="scr scr--board">
      <div className="scr-board__top">
        <span>{b.course}</span>
        <span>{b.progress}</span>
        <span className="scr-timer">{b.timer}</span>
      </div>
      <p className="scr-board__q">{b.question}</p>
      <ol className="scr-bars">
        {b.answers.map((a, i) => (
          <li key={a} className={i === 1 ? "is-right" : undefined} style={{ "--share": SHARES[i] / 100 } as React.CSSProperties}>
            <span className="scr-bars__key">{keys[i]}</span>
            <span className="scr-bars__label">{a}</span>
            <span className="scr-bars__fill" />
            <span className="scr-bars__pct">{SHARES[i]}%</span>
          </li>
        ))}
      </ol>
      <p className="scr-board__foot">{b.answered}</p>
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
