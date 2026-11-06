import { describe, expect, it } from "vitest";
import { VERDICT_AFTER_REVEAL_MS, VERDICT_MAX_MS, VERDICT_MS, RESULT_WAIT_MS, reduce } from "@/lib/app/session/engine";
import { viewOf } from "@/lib/app/session/view";
import { T0, event, events, from, play, question, result, session, snap, snapshot } from "./support/session";

const SKEW = 90_000; // the phone's clock runs a minute and a half ahead of the server's
const local = (server: number) => server + SKEW;
const open = (n: number, over = {}) => snapshot({ question: question(n), serverNow: question(n).firedAt! + 2000, ...over });
const stage = (s: ReturnType<typeof play>, server: number) => viewOf(s, local(server)).stage;

describe("before and around the first snapshot", () => {
  it("shows nothing until a snapshot has come", () => {
    expect(viewOf(play(), 0).stage).toBe("syncing");
  });

  it("is waiting for the start in the lobby", () => {
    const s = play(snap(snapshot({ session: session({ state: "lobby" }) }), SKEW));
    expect(viewOf(s, local(T0)).stage).toBe("waiting_start");
    expect(viewOf(s, local(T0)).joined).toBe(20);
  });

  it("is waiting for the next question while teaching with none open", () => {
    expect(stage(play(snap(snapshot(), SKEW)), T0)).toBe("waiting_next");
  });

  it("ignores a snapshot of another session", () => {
    const s = play(snap(snapshot({ session: session({ id: "other" }) }), SKEW));
    expect(s.session).toBeNull();
  });
});

describe("answering on the server's clock", () => {
  const s0 = play(snap(open(1), SKEW));
  const q = question(1);

  it("counts down to closes_at in server time, whatever the phone's clock says", () => {
    const at = (serverMs: number) => viewOf(s0, local(serverMs));
    expect(at(q.firedAt! + 2000).secondsLeft).toBe(18);
    expect(at(q.firedAt! + 2000).duration).toBe(20_000);
    expect(at(q.firedAt! + 2000).elapsed).toBe(2000);
    expect(at(q.firedAt! + 19_100).secondsLeft).toBe(1);
    expect(at(q.firedAt! + 19_100).stage).toBe("answering");
  });

  it("is answering while the question is open and unanswered", () => {
    expect(stage(s0, q.firedAt! + 5000)).toBe("answering");
  });

  it("locks the answer with the time it was given in server terms, then waits for others", () => {
    const s = from(s0, { type: "answer", response: "2", key: "k1", now: local(q.firedAt! + 4000) });
    expect(s.mine).toEqual({ response: "2", key: "k1", at: q.firedAt! + 4000, status: "sending" });
    expect(stage(s, q.firedAt! + 4100)).toBe("waiting_others");
    expect(viewOf(s, local(q.firedAt! + 4100)).picked).toBe("2");
  });

  it("keeps the first answer: a second tap changes nothing", () => {
    const once = from(s0, { type: "answer", response: "2", key: "k1", now: local(q.firedAt! + 4000) });
    const twice = reduce(once, { type: "answer", response: "3", key: "k2", now: local(q.firedAt! + 4500) });
    expect(twice).toBe(once);
  });

  it("refuses a tap after the server's time is up, even if the phone's clock has not got there", () => {
    // The phone is 90 s ahead here; a phone 90 s behind would think there were 90 s left.
    const behind = play(snap(open(1), -SKEW));
    const tooLate = reduce(behind, { type: "answer", response: "1", key: "k", now: q.firedAt! + 20_500 - SKEW });
    expect(tooLate.mine).toBeNull();
    const inTime = reduce(behind, { type: "answer", response: "1", key: "k", now: q.firedAt! + 19_500 - SKEW });
    expect(inTime.mine).not.toBeNull();
  });

  it("does not take an answer when no question is open", () => {
    const s = play(snap(snapshot(), SKEW));
    expect(reduce(s, { type: "answer", response: "1", key: "k", now: 0 })).toBe(s);
  });

  it("stops taking answers when the clock reaches closes_at, before the server says so", () => {
    expect(stage(s0, q.closesAt!)).toBe("waiting_result");
    expect(stage(s0, q.closesAt! - 1)).toBe("answering");
  });

  it("marks the answer sent when the server has it", () => {
    const s = from(s0, { type: "answer", response: "2", key: "k1", now: local(q.firedAt! + 4000) }, { type: "answer.sent", key: "k1" });
    expect(s.mine?.status).toBe("sent");
  });

  it("ignores the news of an answer that is no longer the current one", () => {
    const s = from(s0, { type: "answer", response: "2", key: "k1", now: local(q.firedAt! + 4000) });
    expect(reduce(s, { type: "answer.sent", key: "other" })).toBe(s);
    expect(reduce(s, { type: "answer.late", key: "other" })).toBe(s);
  });
});

describe("the verdict", () => {
  const q = question(1);
  const answered = from(
    play(snap(open(1), SKEW)),
    { type: "answer", response: "1", key: "k1", now: local(q.firedAt! + 4000) },
    { type: "answer.sent", key: "k1" },
  );
  const closeAt = q.firedAt! + 20_000;

  it("shows right with the points, then the ranking after a few seconds", () => {
    const s = from(answered, event(events.closed(1, closeAt), local(closeAt)), event(events.result(1, closeAt + 100), local(closeAt + 100)));
    const v = viewOf(s, local(closeAt + 200));
    expect(v.stage).toBe("right");
    expect(v).toMatchObject({ correct: true, gain: 13, bonus: 3, points: 13, rank: 4, correctAnswer: "1" });
    expect(viewOf(s, local(closeAt + 100) + VERDICT_MS - 1).stage).toBe("right");
    expect(viewOf(s, local(closeAt + 100) + VERDICT_MS).stage).toBe("waiting_next");
  });

  it("is waiting for the result between the question closing and the result arriving", () => {
    const s = from(answered, event(events.closed(1, closeAt), local(closeAt)));
    expect(viewOf(s, local(closeAt + 500)).stage).toBe("waiting_result");
  });

  it("gives up waiting for a result that does not come", () => {
    const s = from(answered, event(events.closed(1, closeAt), local(closeAt)));
    expect(viewOf(s, local(closeAt + RESULT_WAIT_MS + 1)).stage).toBe("waiting_next");
  });

  it("moves on to the next question as soon as it opens, verdict or not", () => {
    const s = from(
      answered,
      event(events.result(1, closeAt + 100), local(closeAt + 100)),
      event(events.opened(2), local(closeAt + 1000)),
    );
    expect(viewOf(s, local(closeAt + 1100)).stage).toBe("answering");
    expect(s.result).toBeNull();
    expect(s.mine).toBeNull();
    expect(s.question?.id).toBe("q2");
  });

  it("shows wrong, and holds it until the teacher reveals the answer", () => {
    const wrong = from(
      answered,
      event(events.result(1, closeAt + 100, { correct: false, points: 0, speedBonus: 0, correctAnswer: null }, 0), local(closeAt + 100)),
    );
    const resultAt = local(closeAt + 100);
    expect(viewOf(wrong, resultAt + VERDICT_MS + 1000).stage).toBe("wrong");
    expect(viewOf(wrong, resultAt + VERDICT_MS + 1000).correctAnswer).toBeNull();
    expect(viewOf(wrong, resultAt + VERDICT_MAX_MS - 1).stage).toBe("wrong");
    expect(viewOf(wrong, resultAt + VERDICT_MAX_MS).stage).toBe("waiting_next");

    const revealedAt = resultAt + 9000;
    const shown = reduce(wrong, event(events.revealed(1, closeAt + 9100, "2"), revealedAt));
    expect(viewOf(shown, revealedAt + 1).correctAnswer).toBe("2");
    expect(viewOf(shown, revealedAt + VERDICT_AFTER_REVEAL_MS - 1).stage).toBe("wrong");
    expect(viewOf(shown, revealedAt + VERDICT_AFTER_REVEAL_MS).stage).toBe("waiting_next");
  });

  it("takes the reveal that came before the result", () => {
    const s = from(
      answered,
      event(events.revealed(1, closeAt + 50, "2"), local(closeAt + 50)),
      event(events.result(1, closeAt + 100, { correct: false, points: 0, correctAnswer: null }, 0), local(closeAt + 100)),
    );
    expect(s.result?.correctAnswer).toBe("2");
    expect(s.question?.status).toBe("revealed");
  });

  it("tracks where the student stood before the result", () => {
    const s = from(play(snap(open(1, { sessionRank: 6 }), SKEW)), event(events.result(1, closeAt, { sessionRank: 3 }), local(closeAt)));
    expect(viewOf(s, local(closeAt)).rank).toBe(3);
    expect(viewOf(s, local(closeAt)).rankBefore).toBe(6);
  });

  it("says a late answer was late, and shows no answer for it", () => {
    const sending = from(
      play(snap(open(1), SKEW)),
      { type: "answer", response: "1", key: "k1", now: local(closeAt - 200) },
    );
    const s = from(
      sending,
      event(events.closed(1, closeAt), local(closeAt)),
      { type: "answer.late", key: "k1" },
      event(events.result(1, closeAt + 300, { correct: false, points: 0, correctAnswer: null }, 0), local(closeAt + 300)),
    );
    const v = viewOf(s, local(closeAt + 400));
    expect(v).toMatchObject({ stage: "wrong", picked: null, answer: "late" });
  });
});

describe("a question closing while the student is mid-answer", () => {
  const q = question(1);
  const closeAt = q.closesAt!;

  it("keeps the tap, waits for the server to say what it was worth, and shows the verdict", () => {
    const tapped = from(play(snap(open(1), SKEW)), { type: "answer", response: "1", key: "k", now: local(closeAt - 300) });
    // The closing reaches the phone before the answer's acknowledgement does.
    const closed = reduce(tapped, event(events.closed(1, closeAt), local(closeAt)));
    expect(viewOf(closed, local(closeAt + 10)).stage).toBe("waiting_result");
    expect(viewOf(closed, local(closeAt + 10)).picked).toBe("1");
    const acked = from(closed, { type: "answer.sent", key: "k" }, event(events.result(1, closeAt + 200), local(closeAt + 200)));
    expect(viewOf(acked, local(closeAt + 250))).toMatchObject({ stage: "right", picked: "1" });
  });
});

describe("a session ending mid-question", () => {
  const q = question(2);
  const base = play(snap(open(2), SKEW));

  it("goes to the ended screen with the tally, the points and the rank", () => {
    const s = reduce(base, event(events.ended(q.firedAt! + 6000), local(q.firedAt! + 6000)));
    const v = viewOf(s, local(q.firedAt! + 6100));
    expect(v.stage).toBe("ended");
    expect(v.summary).toEqual({ right: 3, total: 5 });
    expect(v.points).toBe(31);
    expect(v.rank).toBe(2);
  });

  it("takes no more answers and opens no more questions", () => {
    const s = reduce(base, event(events.ended(q.firedAt! + 6000)));
    expect(reduce(s, { type: "answer", response: "1", key: "k", now: local(q.firedAt! + 6500) }).mine).toBeNull();
    expect(reduce(s, event(events.opened(3))).question?.id).toBe("q2");
    expect(viewOf(reduce(s, event(events.state("teaching", q.firedAt! + 7000))), 0).stage).toBe("ended");
  });

  it("is also what a state change to ended means, before the summary comes", () => {
    const s = reduce(base, event(events.state("ended", q.firedAt! + 6000)));
    expect(viewOf(s, local(q.firedAt! + 6100))).toMatchObject({ stage: "ended", summary: null });
    const withSummary = reduce(s, event(events.ended(q.firedAt! + 6050)));
    expect(viewOf(withSummary, 0).summary).toEqual({ right: 3, total: 5 });
  });

  it("comes back as ended from a snapshot after the phone slept through it", () => {
    const s = reduce(base, snap(snapshot({ session: session({ state: "ended" }), serverNow: T0 + 999_000, summary: { right: 4, total: 5 }, sessionPoints: 40 }), SKEW));
    expect(viewOf(s, 0)).toMatchObject({ stage: "ended", points: 40, summary: { right: 4, total: 5 } });
  });
});

describe("events out of order and twice", () => {
  const q1 = question(1);
  const q2 = question(2);

  it("keeps a question closed when its opening arrives late", () => {
    const s = from(
      play(snap(snapshot({ serverNow: T0 }), SKEW)),
      event(events.opened(1)),
      event(events.closed(1, q1.firedAt! + 20_000)),
      event(events.opened(1)),
    );
    expect(s.question?.status).toBe("closed");
  });

  it("ignores an older question that turns up after a newer one", () => {
    const s = from(play(snap(snapshot(), SKEW)), event(events.opened(2)), event(events.opened(1)));
    expect(s.question?.id).toBe("q2");
  });

  it("ignores the closing of a question it has already left", () => {
    const s = from(play(snap(snapshot(), SKEW)), event(events.opened(1)), event(events.opened(2)), event(events.closed(1, q2.firedAt! + 1)));
    expect(s.question).toMatchObject({ id: "q2", status: "open" });
    expect(s.stale).toBe(false);
  });

  it("never moves the session back a state", () => {
    const s = from(play(snap(snapshot({ session: session({ state: "review" }) }), SKEW)), event(events.state("teaching", T0 + 10)));
    expect(s.session?.state).toBe("review");
  });

  it("moves a lobby to teaching when a question opens, if the state change was missed", () => {
    const s = from(play(snap(snapshot({ session: session({ state: "lobby" }) }), SKEW)), event(events.opened(1)));
    expect(s.session?.state).toBe("teaching");
  });

  it("is the same after a duplicate event as after one", () => {
    const base = play(snap(snapshot(), SKEW));
    const once = from(base, event(events.opened(1)), event(events.closed(1, q1.closesAt!)), event(events.result(1, q1.closesAt! + 100), 5000));
    const twice = from(once, event(events.opened(1)), event(events.closed(1, q1.closesAt!)), event(events.result(1, q1.closesAt! + 100), 9000));
    expect(twice).toBe(once);
  });

  it("does not restart the verdict, or forget the rank before it, when the result comes twice", () => {
    const base = play(snap(open(1, { sessionRank: 7 }), SKEW));
    const once = reduce(base, event(events.result(1, q1.closesAt!, { sessionRank: 4 }), 5000));
    const twice = reduce(once, event(events.result(1, q1.closesAt! + 5, { sessionRank: 4 }), 9000));
    expect(twice.resultAt).toBe(5000);
    expect(twice.rankBefore).toBe(7);
    expect(twice.sessionPoints).toBe(13);
  });

  it("fills in the right answer from a repeat of the result that knows it", () => {
    const base = play(snap(open(1), SKEW));
    const first = reduce(base, event(events.result(1, q1.closesAt!, { correct: false, correctAnswer: null }), 5000));
    const again = reduce(first, event(events.result(1, q1.closesAt! + 5, { correct: false, correctAnswer: "3" }), 6000));
    expect(again.result?.correctAnswer).toBe("3");
    expect(again.resultAt).toBe(5000);
  });

  it("counts the same joined.count twice once", () => {
    const base = play(snap(snapshot({ session: session({ state: "lobby" }) }), SKEW));
    const ev = { type: "joined.count" as const, serverNow: T0 + 50, joinedCount: 22, recent: ["Ana", "Luka"] };
    const once = reduce(base, event(ev));
    expect(reduce(once, event(ev))).toBe(once);
    expect(once.session?.joinedCount).toBe(22);
  });

  it("asks for a snapshot when an event is about a question it never had", () => {
    const s = from(play(snap(snapshot(), SKEW)), event(events.closed(3, T0 + 100)));
    expect(s.stale).toBe(true);
    expect(from(play(snap(snapshot(), SKEW)), event(events.result(3, T0 + 100))).stale).toBe(true);
    expect(from(play(snap(snapshot(), SKEW)), event(events.revealed(3, T0 + 100))).stale).toBe(true);
  });

  it("clears that when the snapshot arrives", () => {
    const stale = from(play(snap(snapshot(), SKEW)), event(events.closed(3, T0 + 100)));
    const fixed = from(stale, { type: "resync" }, snap(snapshot({ serverNow: T0 + 200, question: question(3, { status: "closed" }) }), SKEW));
    expect(fixed.stale).toBe(false);
    expect(fixed.question?.id).toBe("q3");
  });

  it("shows the progress of the open question, and drops it when the question closes", () => {
    const s = from(
      play(snap(open(1), SKEW)),
      event({ type: "question.progress", serverNow: q1.firedAt! + 5000, sessionQuestionId: "q1", answered: 11, joined: 24 }),
    );
    expect(viewOf(s, 0).progress).toEqual({ answered: 11, joined: 24 });
    expect(reduce(s, event(events.closed(1, q1.closesAt!))).progress).toBeNull();
    const other = reduce(s, event({ type: "question.progress", serverNow: q1.firedAt! + 6000, sessionQuestionId: "q9", answered: 1, joined: 24 }));
    expect(other.progress).toEqual({ answered: 11, joined: 24 });
  });

  it("keeps the session ranking it is sent", () => {
    const rows = [
      { studentId: "a", name: "Ana", points: 30, rank: 1 },
      { studentId: "me", name: "Me", points: 20, rank: 2 },
    ];
    const s = reduce(play(snap(snapshot(), SKEW)), event({ type: "leaderboard.updated", serverNow: T0 + 1, rows }));
    expect(viewOf(s, 0).board).toEqual(rows);
    expect(reduce(s, event({ type: "leaderboard.updated", serverNow: T0 + 2, rows: [...rows] }))).toBe(s);
  });
});

describe("a skipped question", () => {
  const q = question(1);

  it("takes the question away: nobody scores, and the student is waiting for the next", () => {
    const answered = from(play(snap(open(1), SKEW)), { type: "answer", response: "1", key: "k", now: local(q.firedAt! + 3000) });
    const s = reduce(answered, event(events.skipped(1, q.firedAt! + 8000)));
    expect(s.mine).toBeNull();
    expect(viewOf(s, local(q.firedAt! + 8100))).toMatchObject({ stage: "waiting_next", skipped: true, picked: null });
  });

  it("discards a result that arrives for it afterwards", () => {
    const s = from(play(snap(open(1), SKEW)), event(events.skipped(1, q.firedAt! + 8000)), event(events.result(1, q.firedAt! + 8100)));
    expect(s.result).toBeNull();
  });

  it("cannot skip a question that was already revealed", () => {
    const s = from(play(snap(open(1), SKEW)), event(events.revealed(1, q.firedAt! + 9000)), event(events.skipped(1, q.firedAt! + 9500)));
    expect(s.question?.status).toBe("revealed");
  });
});

describe("a snapshot after a reconnect", () => {
  const q1 = question(1);
  const q3 = question(3, { status: "closed" });

  it("replaces what the phone believed, whatever it was", () => {
    const believing = from(
      play(snap(open(1), SKEW)),
      { type: "answer", response: "2", key: "k", now: local(q1.firedAt! + 4000) },
      { type: "answer.sent", key: "k" },
      event({ type: "question.progress", serverNow: q1.firedAt! + 5000, sessionQuestionId: "q1", answered: 5, joined: 24 }),
    );
    const s = from(
      believing,
      { type: "resync" },
      snap(
        snapshot({
          serverNow: q3.closesAt! + 1000,
          question: q3,
          myResponse: "0",
          result: result(3, { correct: false, points: 0, sessionRank: 9, correctAnswer: null }),
          sessionPoints: 26,
          sessionRank: 9,
        }),
        SKEW,
      ),
    );
    expect(s.question?.id).toBe("q3");
    expect(s.mine).toMatchObject({ response: "0", status: "sent" });
    expect(s.progress).toBeNull();
    expect(s.sessionPoints).toBe(26);
    expect(s.sessionRank).toBe(9);
    expect(s.rankBefore).toBe(5);
    expect(s.seen).toContain("q1");
    // It closed a second ago: the student still gets their verdict.
    expect(viewOf(s, local(q3.closesAt! + 1500)).stage).toBe("wrong");
  });

  it("does not replay a verdict for a question that closed long ago", () => {
    const s = play(snap(snapshot({ question: q3, serverNow: q3.closesAt! + 5 * 60_000, result: result(3) }), SKEW));
    expect(viewOf(s, local(q3.closesAt! + 5 * 60_000)).stage).toBe("waiting_next");
  });

  it("keeps an answer that is still on its way to the server for the same open question", () => {
    const sending = from(play(snap(open(1), SKEW)), { type: "answer", response: "2", key: "k", now: local(q1.firedAt! + 4000) });
    const s = from(sending, { type: "resync" }, snap(open(1, { serverNow: q1.firedAt! + 6000 }), SKEW));
    expect(s.mine).toMatchObject({ response: "2", key: "k", status: "sending" });
  });

  it("lets the server's answer win over the app's, since the first answer stands", () => {
    const sending = from(play(snap(open(1), SKEW)), { type: "answer", response: "2", key: "k", now: local(q1.firedAt! + 4000) });
    const s = reduce(sending, snap(open(1, { serverNow: q1.firedAt! + 6000, myResponse: "0" }), SKEW));
    expect(s.mine).toMatchObject({ response: "0", status: "sent", key: "k" });
  });

  it("drops an answer the server does not have once it believes it was sent", () => {
    const sent = from(
      play(snap(open(1), SKEW)),
      { type: "answer", response: "2", key: "k", now: local(q1.firedAt! + 4000) },
      { type: "answer.sent", key: "k" },
    );
    expect(reduce(sent, snap(open(1, { serverNow: q1.firedAt! + 6000 }), SKEW)).mine).toBeNull();
  });

  it("keeps the marker that an answer came too late, so the verdict can say why", () => {
    const late = from(
      play(snap(open(1), SKEW)),
      { type: "answer", response: "2", key: "k", now: local(q1.closesAt! - 100) },
      { type: "answer.late", key: "k" },
    );
    const s = reduce(late, snap(snapshot({ question: { ...q1, status: "closed" }, serverNow: q1.closesAt! + 100 }), SKEW));
    expect(s.mine?.status).toBe("late");
  });

  it("takes a snapshot whose server time is behind the last one's, as another server's clock may be, so held events are never stuck", () => {
    const newer = play(snap(open(2, { serverNow: question(2).firedAt! + 5000 }), SKEW));
    const older = from(newer, { type: "resync" }, snap(open(1), SKEW));
    expect(older.awaiting).toBe(false);
    expect(older.question?.id).toBe("q1");
  });

  it("measures the server's clock again, and keeps the better measurement", () => {
    const first = play(snap(snapshot(), SKEW));
    const slower = reduce(first, { type: "snapshot", snapshot: snapshot({ serverNow: T0 + 5000 }), sentAt: T0 + 5000 + SKEW - 400, receivedAt: T0 + 5000 + SKEW + 400 });
    expect(slower.clock?.offset).toBe(-SKEW);
    const faster = reduce(first, snap(snapshot({ serverNow: T0 + 5000 }), SKEW + 2000));
    expect(faster.clock?.offset).toBe(-SKEW - 2000);
  });
});

describe("events that arrive while a snapshot is awaited", () => {
  const q1 = question(1);

  it("are held, then applied on top of the snapshot, oldest first", () => {
    const s = from(
      play(),
      event(events.closed(1, q1.closesAt!)),
      event(events.result(1, q1.closesAt! + 100), 7000),
      snap(open(1, { serverNow: q1.firedAt! + 3000 }), SKEW),
    );
    expect(s.pending).toEqual([]);
    expect(s.question?.status).toBe("closed");
    expect(s.result?.sessionQuestionId).toBe("q1");
  });

  it("are dropped when the snapshot already reflects them", () => {
    const s = from(
      play(),
      event(events.opened(1)),
      snap(snapshot({ question: { ...q1, status: "closed" }, serverNow: q1.closesAt! + 50 }), SKEW),
    );
    expect(s.question?.status).toBe("closed");
  });

  it("are applied even when the snapshot was cut before them: the snapshot cannot undo what the phone has heard", () => {
    // The request went out, the question closed and said so on the event link, then the (older) response came in.
    const s = from(
      play(snap(open(1), SKEW)),
      { type: "resync" },
      event(events.closed(1, q1.closesAt!), local(q1.closesAt!)),
      snap(open(1, { serverNow: q1.closesAt! - 500 }), SKEW),
    );
    expect(s.question?.status).toBe("closed");
  });

  it("are held on a live session too, while it asks again after a reconnect", () => {
    const live = play(snap(open(1), SKEW));
    const asking = reduce(live, { type: "resync" });
    const held = reduce(asking, event(events.closed(1, q1.closesAt!)));
    expect(held.question?.status).toBe("open");
    expect(held.pending).toHaveLength(1);
  });

  it("are applied to what the phone has if the snapshot keeps failing", () => {
    const live = from(play(snap(open(1), SKEW)), { type: "resync" }, event(events.closed(1, q1.closesAt!)));
    const s = reduce(live, { type: "unhold", receivedAt: 1 });
    expect(s.awaiting).toBe(false);
    expect(s.question?.status).toBe("closed");
    expect(s.pending).toEqual([]);
  });

  it("keep only the newest when the outage is long", () => {
    let s = play();
    for (let i = 0; i < 250; i++) s = reduce(s, event({ type: "joined.count", serverNow: T0 + i, joinedCount: i, recent: [] }));
    expect(s.pending).toHaveLength(200);
  });
});

describe("an answer saved for the connection", () => {
  const q = question(1);
  const answered = (key = "k") => from(play(snap(open(1), SKEW)), { type: "answer", response: "2", key, now: local(q.firedAt! + 4000) });
  const closedSnap = (over = {}) => snap(snapshot({ question: { ...q, status: "closed" }, serverNow: q.closesAt! + 4000, ...over }), SKEW);

  it("is saved after a failed attempt, and sent when the server has it", () => {
    const saved = from(answered(), { type: "answer.saved", key: "k" });
    expect(viewOf(saved, local(q.firedAt! + 5000))).toMatchObject({ answer: "saved", picked: "2", stage: "waiting_others" });
    expect(reduce(saved, { type: "answer.sent", key: "k" }).mine).toMatchObject({ status: "sent", held: true });
    expect(reduce(saved, { type: "answer.saved", key: "other" })).toBe(saved);
  });

  it("is still the student's answer after the question closed: the server counts it by the time given (BR-NET-01)", () => {
    const saved = from(answered(), { type: "answer.saved", key: "k" });
    const s = reduce(saved, closedSnap());
    expect(s.mine).toMatchObject({ response: "2", key: "k", status: "saved" });
  });

  it("waits to say right or wrong while the answer has not reached the server, even with a result in hand", () => {
    const saved = from(answered(), { type: "answer.saved", key: "k" }, closedSnap({ result: result(1, { correct: false, points: 0, correctAnswer: null }) }));
    for (const ms of [100, 10_000, 120_000]) expect(stage(saved, q.closesAt! + 4000 + ms)).toBe("waiting_result");
    expect(viewOf(saved, local(q.closesAt! + 5000))).toMatchObject({ answer: "saved", picked: "2" });
  });

  it("shows the verdict when the late answer is counted, however long after the question it is", () => {
    const wrongForNow = from(answered(), { type: "answer.saved", key: "k" }, closedSnap({ result: result(1, { correct: false, points: 0, correctAnswer: null }) }));
    const delivered = reduce(wrongForNow, { type: "answer.sent", key: "k", now: local(q.closesAt! + 90_000) });
    const counted = reduce(delivered, snap(snapshot({ question: { ...q, status: "closed" }, serverNow: q.closesAt! + 90_000, result: result(1, { correct: true, points: 13 }), sessionPoints: 13, myResponse: "2" }), SKEW));
    expect(stage(counted, q.closesAt! + 90_100)).toBe("right");
    expect(viewOf(counted, local(q.closesAt! + 90_100))).toMatchObject({ gain: 13, points: 13, answer: "sent" });
  });

  it("reads a verdict that was waiting on the answer from the moment it arrived", () => {
    const waiting = from(answered(), { type: "answer.saved", key: "k" }, closedSnap({ result: result(1, { correct: false, points: 0, correctAnswer: null }) }));
    const delivered = reduce(waiting, { type: "answer.sent", key: "k", now: local(q.closesAt! + 60_000) });
    expect(stage(delivered, q.closesAt! + 60_500)).toBe("wrong");
  });

  it("takes a corrected result from the server for the same question", () => {
    const s = from(
      play(snap(snapshot({ question: { ...q, status: "closed" }, serverNow: q.closesAt! + 1000, result: result(1, { correct: false, points: 0, correctAnswer: null }) }), SKEW)),
      event(events.result(1, q.closesAt! + 50_000, { correct: true, points: 14 }, 14), local(q.closesAt! + 50_000)),
    );
    expect(s.result).toMatchObject({ correct: true, points: 14 });
    expect(s.sessionPoints).toBe(14);
    expect(s.resultAt).toBe(local(q.closesAt! + 50_000));
  });

  it("lets the answer go when the server will never take it", () => {
    const saved = from(answered(), { type: "answer.saved", key: "k" });
    expect(reduce(saved, { type: "answer.failed", key: "k" }).mine).toBeNull();
    expect(reduce(saved, { type: "answer.failed", key: "other" })).toBe(saved);
  });

  it("marks a saved answer late when the server refuses it as outside the window", () => {
    const saved = from(answered(), { type: "answer.saved", key: "k" }, { type: "answer.late", key: "k" });
    expect(viewOf(saved, local(q.firedAt! + 5000))).toMatchObject({ answer: "late", picked: null });
  });

  describe("after a reload", () => {
    const restore = { type: "answer.restore", kind: "answer", key: "k9", sessionQuestionId: "q1", response: "3", at: q.firedAt! + 3000 } as const;

    it("is put back on the question it was given for, as saved", () => {
      const s = reduce(play(snap(open(1), SKEW)), restore);
      expect(viewOf(s, local(q.firedAt! + 5000))).toMatchObject({ stage: "waiting_others", picked: "3", answer: "saved" });
      expect(s.mine).toMatchObject({ key: "k9", at: q.firedAt! + 3000 });
    });

    it("is not put on another question, a skipped one, an ended session, or over an answer the app already has", () => {
      const other = play(snap(open(2), SKEW));
      expect(reduce(other, restore)).toBe(other);
      const skipped = play(snap(snapshot({ question: { ...q, status: "skipped" }, serverNow: q.firedAt! + 5000 }), SKEW));
      expect(reduce(skipped, restore)).toBe(skipped);
      const ended = play(snap(snapshot({ session: session({ state: "ended" }), question: q, serverNow: q.firedAt! + 5000 }), SKEW));
      expect(reduce(ended, restore)).toBe(ended);
      const have = reduce(answered(), restore);
      expect(have.mine?.key).toBe("k");
    });
  });
});
