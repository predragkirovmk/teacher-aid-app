import { Mark } from "@/components/app/Mark";
import type { SiteV2Dict } from "@/content/site-v2/types";
import liveCapture from "@/content/site-v2/live-capture.json";

/*
  The devices' screens. Where an app has the screen, it is a capture of the real app (Shot, from
  scripts/site-v2-capture.mjs), the live console and the projector's class view among them. The rest
  (the end of a lesson, a class's page, the director's report) is drawn here, laid out like the app
  and tagged "Example"; each is replaced by a capture once the app has it.

  The drawn screens are pictures, so their titles are styled text, not headings: they never enter
  the page's outline. Every screen renders in its final state; the motion layer sets the earlier states itself and
  plays them through (the data-* hooks below), so without it each screen still reads complete.
*/

type S = SiteV2Dict["screens"];

// The captures' sizes: teacher screens are the laptop's 16:10, the projector's screens the board's
// 16:9, student screens the phone's screen under its status bar (390x798).
const SHOTS = {
  t: { widths: [960, 1800], w: 1800, h: 1125 },
  b: { widths: [960, 1800], w: 1800, h: 1013 },
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
  const k = SHOTS[name[0] as keyof typeof SHOTS];
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

/** The teacher app's sidebar: its two places, Lessons and Library, one of them current. */
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

// One real lesson, captured beat by beat (scripts/site-v2-capture.mjs): the class joins, the lesson
// starts, the question is sent, the answers come in, the time runs out and the answer is shown.
const LIVE_BEATS = ["join1", "join2", "ready", "open1", "open2", "shown"] as const;

// A box measured in the capture, as a share of its screen, placed over the picture.
const place = ({ x, y, w, h }: { x: number; y: number; w: number; h: number }): React.CSSProperties => ({
  left: `${x * 100}%`,
  top: `${y * 100}%`,
  width: `${w * 100}%`,
  height: `${h * 100}%`,
});

/**
 * The lesson on one screen: the board (b, the projector's screen) or the teacher's laptop (t). The
 * captures stack in order, so the last, the answer shown, is what reads without the motion layer.
 * Over them sit the boxes the motion layer flies the question between and presses Send on.
 */
export function LiveFrames({ device, lang, sizes }: { device: "b" | "t"; lang: "mk" | "en"; sizes: string }) {
  const at = liveCapture[lang];
  return (
    <>
      {LIVE_BEATS.map((beat) => (
        <Shot key={beat} name={`${device}-live-${beat}`} lang={lang} sizes={sizes} data-live-frame={beat} />
      ))}
      {device === "b" ? (
        <span className="live__mark" data-board-question style={{ ...place(at.to), fontSize: `${at.to.size}cqw` }} />
      ) : (
        <>
          <span className="live__mark" data-send-row style={place(at.from)} />
          <span className="live__mark live__press" data-send style={place(at.send)} />
        </>
      )}
    </>
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
          <span className="scr-btn scr-btn--primary">{e.copy}</span>
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
      <Side s={s} on={1} />
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
