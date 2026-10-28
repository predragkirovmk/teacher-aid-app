import { CLASS_COLS, CLASS_ROWS, CLASS_SIZE } from "@/lib/site-v2/classroom";

/*
  The class from above, for the hero's pinned scene: five rows of three double desks, 29 phones
  and one empty seat. Each phone has four answer bars; the one its student picks lights yellow
  when the motion layer reaches it. Shown only while that layer runs (see .hero__end).
*/

// Which answer each student picks. Most choose the right one (the second), as in a real class.
const PICKS = [1, 1, 2, 1, 0, 1, 1, 3, 1, 1, 2, 1];

export function Classroom({ label }: { label: string }) {
  const desks = Array.from({ length: (CLASS_ROWS * CLASS_COLS) / 2 }, (_, d) => [d * 2, d * 2 + 1]);
  return (
    <div className="class" role="img" aria-label={label} data-class>
      {desks.map((seats, d) => (
        <span className="class__desk" key={d}>
          {seats.map((i) =>
            i < CLASS_SIZE ? (
              <span className="seat" key={i} data-seat={i}>
                <span className="seat__screen">
                  {[0, 1, 2, 3].map((b) => (
                    <i key={b} className={b === PICKS[i % PICKS.length] ? "is-pick" : undefined}>
                      {b === PICKS[i % PICKS.length] && <b data-lit />}
                    </i>
                  ))}
                </span>
              </span>
            ) : (
              <span className="seat seat--empty" key={i} />
            ),
          )}
        </span>
      ))}
    </div>
  );
}
