import { describe, expect, it } from "vitest";
import type { OpenerSnapshot, SessionEvent, SessionQuestion } from "@/lib/app/api/types";
import { cleanReason, reduce } from "@/lib/app/session/engine";
import { viewOf } from "@/lib/app/session/view";
import { T0, event, from, play, result, session, snap, snapshot } from "./support/session";

const SKEW = 90_000;
const local = (server: number) => server + SKEW;

/** The opener fired at T0 + 10 s: voting until 30 s later, reasons until 45 s after that, 80 characters at most. */
const FIRED = T0 + 10_000;
const VOTE_END = FIRED + 30_000;
const END = FIRED + 75_000;
const opener = (over: Partial<SessionQuestion> = {}): SessionQuestion => ({
  id: "o1",
  index: 0,
  total: 5,
  kind: "opener_prediction",
  prompt: "Which lands first?",
  options: ["The heavy one", "The light one", "Together"],
  status: "open",
  timerSeconds: 75,
  firedAt: FIRED,
  closesAt: END,
  numeric: null,
  opener: { voteClosesAt: VOTE_END, reasonMax: 80 },
  ...over,
});
const debate = () => opener({ id: "d1", kind: "opener_debate", options: null, prompt: "Spelling matters in a message." });

const withSession = (q: SessionQuestion, over = {}) =>
  snapshot({ session: session({ state: "opener" }), question: q, serverNow: FIRED + 2000, ...over });
const stageAt = (s: ReturnType<typeof play>, server: number) => viewOf(s, local(server)).stage;
const vote = (response: string, atServer: number, key = "v1") => ({ type: "answer", response, key, now: local(atServer) }) as const;
const reason = (text: string, atServer: number, key = "r1") => ({ type: "reason", text, key, now: local(atServer) }) as const;
const counts = (serverNow: number, phase: "voting" | "reasoning" | "revealed", votes: number[], id = "o1"): SessionEvent => ({
  type: "opener.counts",
  serverNow,
  sessionQuestionId: id,
  phase,
  votes,
});
const reasons = (serverNow: number, items: string[], id = "o1"): SessionEvent => ({ type: "opener.reasons", serverNow, sessionQuestionId: id, reasons: items });

describe("voting", () => {
  const s0 = play(snap(withSession(opener()), SKEW));

  it("starts at the vote, with a clock for the vote and not for the whole opener", () => {
    const v = viewOf(s0, local(FIRED + 2000));
    expect(v.stage).toBe("voting");
    expect(v.opener).toMatchObject({ kind: "prediction", phase: "voting", votingOpen: true, reasonMax: 80, votes: null });
    expect(v.duration).toBe(30_000);
    expect(v.secondsLeft).toBe(28);
  });

  it("moves the lesson from the lobby to the opener when the opener opens", () => {
    const lobby = play(snap(snapshot({ session: session({ state: "lobby" }) }), SKEW));
    const s = from(lobby, event({ type: "question.opened", serverNow: FIRED, question: opener() }));
    expect(s.session?.state).toBe("opener");
    expect(stageAt(s, FIRED + 100)).toBe("voting");
  });

  it("takes a vote inside the window and keeps the time it was given", () => {
    const s = from(s0, vote("1", FIRED + 4000));
    expect(s.mine).toEqual({ response: "1", key: "v1", at: FIRED + 4000, status: "sending" });
    expect(viewOf(s, local(FIRED + 4100)).picked).toBe("1");
  });

  it("refuses a vote after the vote closes, even though the opener itself is still open", () => {
    expect(reduce(s0, vote("1", VOTE_END + 1))).toBe(s0);
    expect(stageAt(s0, VOTE_END + 1)).toBe("opener_wait");
  });

  it("refuses a vote once the server has moved the class on, before the vote's own time is up", () => {
    const moved = from(s0, event(counts(FIRED + 5000, "reasoning", [4, 2, 20])));
    expect(reduce(moved, vote("1", FIRED + 6000))).toBe(moved);
    expect(stageAt(moved, FIRED + 6000)).toBe("opener_wait");
  });

  it("keeps the first vote: a second tap changes nothing", () => {
    const once = from(s0, vote("1", FIRED + 4000));
    expect(reduce(once, vote("2", FIRED + 4500, "v2"))).toBe(once);
  });

  it("holds a debate vote as agree or disagree", () => {
    const d = play(snap(withSession(debate()), SKEW));
    const s = from(d, vote("agree", FIRED + 3000));
    expect(viewOf(s, local(FIRED + 3100))).toMatchObject({ picked: "agree", opener: { kind: "debate" } });
  });
});

describe("the reason", () => {
  const voted = from(play(snap(withSession(opener()), SKEW)), vote("2", FIRED + 4000));

  it("opens the moment the vote is in, with the clock of the whole opener", () => {
    const v = viewOf(voted, local(FIRED + 5000));
    expect(v.stage).toBe("reasoning");
    expect(v.duration).toBe(END - (FIRED + 4000));
    expect(v.secondsLeft).toBe(70);
  });

  it("takes a reason after the vote closes too, until the opener ends", () => {
    expect(stageAt(voted, VOTE_END + 10_000)).toBe("reasoning");
    const s = from(voted, reason("Because there is no air.", VOTE_END + 10_000));
    expect(s.reason?.status).toBe("sending");
  });

  it("is cleaned to one line and capped at the limit (EC-Q-02)", () => {
    const s = from(voted, reason("  Because\n\nthere   is no air.  ", FIRED + 6000));
    expect(s.reason?.response).toBe("Because there is no air.");
    const long = from(voted, reason("x".repeat(200), FIRED + 6000));
    expect(long.reason?.response).toHaveLength(80);
    expect(cleanReason("  \n ", 80)).toBe("");
  });

  it("counts an emoji as one character when it caps", () => {
    expect(Array.from(cleanReason("😀".repeat(100), 80))).toHaveLength(80);
  });

  it("takes nothing empty, nothing without a vote, nothing twice and nothing after the end", () => {
    expect(reduce(voted, reason("   ", FIRED + 6000))).toBe(voted);
    const unvoted = play(snap(withSession(opener()), SKEW));
    expect(reduce(unvoted, reason("Because.", FIRED + 6000))).toBe(unvoted);
    const once = from(voted, reason("One.", FIRED + 6000));
    expect(reduce(once, reason("Two.", FIRED + 7000, "r2"))).toBe(once);
    expect(reduce(voted, reason("Late.", END + 1))).toBe(voted);
  });

  it("can be skipped, and then the student waits for the class", () => {
    const s = from(voted, { type: "reason.skip" });
    expect(stageAt(s, FIRED + 6000)).toBe("opener_wait");
    expect(s.reason).toBeNull();
  });

  it("is waiting once it is sent", () => {
    const s = from(voted, reason("Because.", FIRED + 6000));
    expect(stageAt(s, FIRED + 6100)).toBe("opener_wait");
    expect(viewOf(s, local(FIRED + 6100)).opener).toMatchObject({ reason: "Because.", reasonAnswer: "sending" });
  });

  it("follows the same sent, saved and late marks as an answer, by its own key", () => {
    const s = from(voted, reason("Because.", FIRED + 6000, "r1"));
    const saved = reduce(s, { type: "answer.saved", key: "r1" });
    expect(saved.reason?.status).toBe("saved");
    expect(saved.mine?.status).toBe("sending");
    const sent = reduce(saved, { type: "answer.sent", key: "r1" });
    expect(sent.reason?.status).toBe("sent");
    expect(reduce(s, { type: "answer.late", key: "r1" }).reason?.status).toBe("late");
    expect(reduce(s, { type: "answer.failed", key: "r1" }).reason).toBeNull();
    // The vote's own mark is not touched by the reason's.
    expect(sent.mine?.status).toBe("sending");
  });
});

describe("the class", () => {
  const voted = from(play(snap(withSession(opener()), SKEW)), vote("2", FIRED + 4000), reason("Because.", FIRED + 6000));

  it("keeps the live counts out of sight while voting is open", () => {
    const s = from(voted, event(counts(FIRED + 7000, "voting", [3, 1, 9])));
    expect(viewOf(s, local(FIRED + 8000)).opener).toMatchObject({ phase: "voting", votes: null });
  });

  it("shows the counts once voting has closed, by the server's word or by the clock", () => {
    const told = from(voted, event(counts(FIRED + 7000, "reasoning", [4, 2, 22])));
    expect(viewOf(told, local(FIRED + 8000)).opener).toMatchObject({ phase: "reasoning", votes: [4, 2, 22] });
    // The clock alone is enough to say voting is over, when the counts have come.
    const late = from(voted, event(counts(FIRED + 7000, "voting", [3, 1, 9])));
    expect(viewOf(late, local(VOTE_END + 1000)).opener).toMatchObject({ phase: "reasoning", votes: [3, 1, 9] });
  });

  it("never goes back a phase when counts arrive out of order", () => {
    const s = from(voted, event(counts(FIRED + 9000, "reasoning", [4, 2, 22])), event(counts(FIRED + 8000, "voting", [3, 1, 9])));
    expect(viewOf(s, local(FIRED + 9500)).opener).toMatchObject({ phase: "reasoning", votes: [4, 2, 22] });
  });

  it("keeps the anonymous reasons the server sends, and gives them with the reveal", () => {
    const s = from(voted, event(counts(FIRED + 80_000, "revealed", [4, 2, 22])), event(reasons(FIRED + 80_000, ["Same on both sides.", "No air."])));
    expect(viewOf(s, local(FIRED + 81_000)).opener).toMatchObject({ phase: "revealed", reasons: ["Same on both sides.", "No air."] });
  });

  it("asks for a snapshot when counts are about a question it never had", () => {
    expect(reduce(voted, event(counts(FIRED + 7000, "voting", [1], "other")))).toMatchObject({ stale: true });
  });
});

describe("the result", () => {
  const closedAt = END;
  const delivered = [{ type: "answer.sent", key: "v1" }, { type: "answer.sent", key: "r1" }] as const;
  const base = from(play(snap(withSession(opener()), SKEW)), vote("2", FIRED + 4000), reason("Because.", FIRED + 6000), ...delivered, event({ type: "question.closed", serverNow: closedAt, sessionQuestionId: "o1" }));
  const withResult = (correct: boolean | null, points: number, reasonPoints: number, extra = {}) =>
    from(
      base,
      event({ type: "question.result", serverNow: closedAt + 100, result: result(0, { sessionQuestionId: "o1", correct, points, reasonPoints, speedBonus: 0, correctAnswer: null }), sessionPoints: points, ...extra }, local(closedAt)),
    );

  it("waits for the vote and the reason to reach the server, then shows the result", () => {
    const undelivered = from(play(snap(withSession(opener()), SKEW)), vote("2", FIRED + 4000), reason("Because.", FIRED + 6000), event({ type: "question.closed", serverNow: closedAt, sessionQuestionId: "o1" }));
    const pending = reduce(undelivered, { type: "answer.saved", key: "v1" });
    expect(stageAt(pending, closedAt + 500)).toBe("opener_wait");
    const arrived = reduce(reduce(pending, { type: "answer.sent", key: "v1" }), { type: "answer.sent", key: "r1" });
    // No result yet and not long since the question closed: still being worked out.
    expect(stageAt(arrived, closedAt + 500)).toBe("opener_wait");
    const done = reduce(arrived, event({ type: "question.result", serverNow: closedAt + 100, result: result(0, { sessionQuestionId: "o1", correct: true, points: 18, reasonPoints: 8, speedBonus: 0 }), sessionPoints: 18 }, local(closedAt)));
    expect(stageAt(done, closedAt + 500)).toBe("opener_result");
  });

  it("splits the points into the vote's and the reason's", () => {
    const s = withResult(true, 18, 8);
    expect(viewOf(s, local(closedAt + 500))).toMatchObject({ stage: "opener_result", correct: true, gain: 18, opener: { votePoints: 10, reasonPoints: 8 } });
  });

  it("gives the reason's points even when the vote was wrong (BR-PTS-06)", () => {
    const s = withResult(false, 8, 8);
    expect(viewOf(s, local(closedAt + 500))).toMatchObject({ correct: false, gain: 8, opener: { votePoints: 0, reasonPoints: 8 } });
  });

  it("has no right or wrong for a debate, only the reason's points (EC-Q-03)", () => {
    const d = from(
      play(snap(withSession(debate()), SKEW)),
      vote("agree", FIRED + 3000, "dv"),
      reason("It changes the meaning.", FIRED + 5000, "dr"),
      { type: "answer.sent", key: "dv" },
      { type: "answer.sent", key: "dr" },
      event({ type: "question.closed", serverNow: closedAt, sessionQuestionId: "d1" }),
      event({ type: "question.result", serverNow: closedAt + 100, result: result(0, { sessionQuestionId: "d1", correct: null, points: 8, reasonPoints: 8, speedBonus: 0 }), sessionPoints: 8 }, local(closedAt)),
    );
    const v = viewOf(d, local(closedAt + 500));
    expect(v).toMatchObject({ stage: "opener_result", correct: null, gain: 8, opener: { kind: "debate", votePoints: 0, reasonPoints: 8 } });
  });

  it("takes a corrected result when a reason that was saved offline is counted late", () => {
    const first = withResult(true, 10, 0);
    const corrected = reduce(first, event({ type: "question.result", serverNow: closedAt + 9000, result: result(0, { sessionQuestionId: "o1", correct: true, points: 18, reasonPoints: 8, speedBonus: 0 }), sessionPoints: 18 }, local(closedAt + 9000)));
    expect(viewOf(corrected, local(closedAt + 9500)).opener).toMatchObject({ votePoints: 10, reasonPoints: 8 });
  });

  it("shows the right answer once the teacher reveals it, and none for a debate", () => {
    const s = from(withResult(false, 8, 8), event({ type: "question.revealed", serverNow: closedAt + 1300, sessionQuestionId: "o1", correctAnswer: "2", explanation: null }, local(closedAt + 1300)));
    expect(viewOf(s, local(closedAt + 1400))).toMatchObject({ stage: "opener_result", correctAnswer: "2" });
    const d = from(
      play(snap(withSession(debate()), SKEW)),
      event({ type: "question.revealed", serverNow: closedAt, sessionQuestionId: "d1", correctAnswer: null, explanation: null }),
    );
    expect(d.question?.status).toBe("revealed");
    expect(viewOf(d, local(closedAt + 100))).toMatchObject({ stage: "opener_result", correctAnswer: null });
  });

  it("is a result with no points for a student who never voted", () => {
    const s = from(
      play(snap(withSession(opener()), SKEW)),
      event({ type: "question.closed", serverNow: closedAt, sessionQuestionId: "o1" }),
      event({ type: "question.result", serverNow: closedAt + 100, result: result(0, { sessionQuestionId: "o1", correct: false, points: 0, reasonPoints: 0, speedBonus: 0 }), sessionPoints: 0 }, local(closedAt)),
    );
    expect(viewOf(s, local(closedAt + 500))).toMatchObject({ stage: "opener_result", picked: null, correct: false, gain: 0 });
  });
});

describe("a snapshot", () => {
  const snapOf = (over: Partial<ReturnType<typeof snapshot>>) => snap(withSession(opener(), over), SKEW);

  it("puts a student who voted and wrote a reason back where they were", () => {
    const o: OpenerSnapshot = { phase: "reasoning", votes: [4, 2, 20], reasons: [] };
    const s = play(snapOf({ myResponse: "2", myReason: "Because.", opener: o, serverNow: VOTE_END + 5000 }));
    expect(viewOf(s, local(VOTE_END + 5100))).toMatchObject({ stage: "opener_wait", picked: "2", opener: { reason: "Because.", reasonAnswer: "sent", phase: "reasoning", votes: [4, 2, 20] } });
  });

  it("puts a student who voted and has not written yet at the reason", () => {
    const s = play(snapOf({ myResponse: "1", serverNow: FIRED + 9000 }));
    expect(stageAt(s, FIRED + 9100)).toBe("reasoning");
  });

  it("keeps a reason that is still on its way to the server, and a skip, for the same opener", () => {
    const s0 = from(play(snapOf({ serverNow: FIRED + 2000 })), vote("1", FIRED + 3000), reason("Because.", FIRED + 4000));
    const s1 = reduce(s0, snap(withSession(opener(), { serverNow: FIRED + 5000, myResponse: "1" }), SKEW));
    expect(s1.reason).toMatchObject({ response: "Because.", status: "sending" });
    const skipped = from(play(snapOf({ myResponse: "1", serverNow: FIRED + 3000 })), { type: "reason.skip" }, snap(withSession(opener(), { serverNow: FIRED + 5000, myResponse: "1" }), SKEW));
    expect(skipped.reasonSkipped).toBe(true);
  });

  it("restores a vote and a reason that were waiting in the outbox when the page was reloaded", () => {
    const s = from(
      play(snapOf({})),
      { type: "answer.restore", kind: "vote", key: "v9", sessionQuestionId: "o1", response: "1", at: FIRED + 3000 },
      { type: "answer.restore", kind: "reason", key: "r9", sessionQuestionId: "o1", response: "Because.", at: FIRED + 4000 },
    );
    expect(s.mine).toMatchObject({ response: "1", status: "saved" });
    expect(s.reason).toMatchObject({ response: "Because.", status: "saved" });
  });
});

describe("the pop-ups after the opener", () => {
  it("start clean: the vote, the reason and the class's counts are not carried on", () => {
    const s = from(
      play(snap(withSession(opener()), SKEW)),
      vote("1", FIRED + 3000),
      reason("Because.", FIRED + 4000),
      event(counts(FIRED + 7000, "reasoning", [1, 2, 3])),
      event({ type: "state.changed", serverNow: END + 9000, state: "teaching" }),
      event({ type: "question.opened", serverNow: END + 9100, question: { ...opener(), id: "q1", kind: "multiple_choice", opener: null, firedAt: END + 9100, closesAt: END + 29_100 } }),
    );
    expect(s.reason).toBeNull();
    expect(s.opener).toBeNull();
    expect(s.mine).toBeNull();
    expect(viewOf(s, local(END + 9500)).stage).toBe("answering");
  });
});
