import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/app/api/errors";
import { SESSION_EVENT_TYPES, iso, sessionEvent, studentState } from "@/lib/app/api/wire";
import { T0 } from "./support/session";

const at = iso(T0);
const wireQ = {
  id: "q1",
  index: 0,
  total: 5,
  kind: "multiple_choice",
  prompt: "2 + 2?",
  options: ["3", "4", "5", "6"],
  status: "open",
  timer_seconds: 25,
  fired_at: iso(T0),
  closes_at: iso(T0 + 25_000),
};

describe("realtime events", () => {
  it("reads each event the student listens for (spec 11.2, PROPOSED payloads)", () => {
    expect(sessionEvent("state.changed", { server_now: at, state: "teaching" })).toEqual({ type: "state.changed", serverNow: T0, state: "teaching" });
    expect(sessionEvent("joined.count", { server_now: at, joined_count: 21, recent: ["Ана", "Лука"] })).toEqual({
      type: "joined.count",
      serverNow: T0,
      joinedCount: 21,
      recent: ["Ана", "Лука"],
    });
    expect(sessionEvent("question.opened", { server_now: at, question: wireQ })).toEqual({
      type: "question.opened",
      serverNow: T0,
      question: { id: "q1", index: 0, total: 5, kind: "multiple_choice", prompt: "2 + 2?", options: ["3", "4", "5", "6"], status: "open", timerSeconds: 25, firedAt: T0, closesAt: T0 + 25_000, numeric: null, opener: null },
    });
    expect(sessionEvent("question.progress", { server_now: at, session_question_id: "q1", answered: 4, joined: 24 })).toMatchObject({ answered: 4, joined: 24 });
    expect(sessionEvent("question.closed", { server_now: at, session_question_id: "q1" })).toEqual({ type: "question.closed", serverNow: T0, sessionQuestionId: "q1" });
    expect(sessionEvent("question.skipped", { server_now: at, session_question_id: "q1" })).toMatchObject({ type: "question.skipped" });
    expect(sessionEvent("question.revealed", { server_now: at, session_question_id: "q1", correct_answer: "1", explanation: "Because." })).toEqual({
      type: "question.revealed",
      serverNow: T0,
      sessionQuestionId: "q1",
      correctAnswer: "1",
      explanation: "Because.",
    });
    expect(sessionEvent("leaderboard.updated", { server_now: at, rows: [{ student_id: "a", name: "Ана", points: 20, rank: 1 }] })).toEqual({
      type: "leaderboard.updated",
      serverNow: T0,
      rows: [{ studentId: "a", name: "Ана", points: 20, rank: 1 }],
    });
    expect(
      sessionEvent("question.result", { server_now: at, session_question_id: "q1", correct: true, points: 13, speed_bonus: 3, session_rank: 2, session_points: 23, correct_answer: null }),
    ).toEqual({
      type: "question.result",
      serverNow: T0,
      sessionPoints: 23,
      result: { sessionQuestionId: "q1", correct: true, points: 13, reasonPoints: 0, speedBonus: 3, sessionRank: 2, correctAnswer: null, explanation: null },
    });
    expect(sessionEvent("session.ended", { server_now: at, session_points: 40, session_rank: 3, summary: { right: 4, total: 5 } })).toEqual({
      type: "session.ended",
      serverNow: T0,
      sessionPoints: 40,
      sessionRank: 3,
      summary: { right: 4, total: 5 },
    });
  });

  it("reads the two events about the student rather than the session, which carry no time", () => {
    expect(sessionEvent("signed_in_elsewhere", {})).toEqual({ type: "signed_in_elsewhere", serverNow: null });
    expect(sessionEvent("notification.created", undefined)).toEqual({ type: "notification.created", serverNow: null });
  });

  it("reads a numeric question's unit, tolerance and sign, and an opener's two windows", () => {
    const num = sessionEvent("question.opened", {
      server_now: at,
      question: { ...wireQ, kind: "numeric", options: null, numeric: { unit: "m/s²", tolerance: 0.1, allow_negative: true } },
    });
    expect(num).toMatchObject({ question: { kind: "numeric", options: null, numeric: { unit: "m/s²", tolerance: 0.1, allowNegative: true }, opener: null } });
    const noUnit = sessionEvent("question.opened", { server_now: at, question: { ...wireQ, kind: "numeric", options: null, numeric: { tolerance: 0, allow_negative: false } } });
    expect(noUnit).toMatchObject({ question: { numeric: { unit: null, tolerance: 0, allowNegative: false } } });
    const op = sessionEvent("question.opened", {
      server_now: at,
      question: { ...wireQ, kind: "opener_prediction", opener: { vote_closes_at: iso(T0 + 30_000), reason_max_length: 80 } },
    });
    expect(op).toMatchObject({ question: { kind: "opener_prediction", numeric: null, opener: { voteClosesAt: T0 + 30_000, reasonMax: 80 } } });
  });

  it("reads the opener's counts and anonymous reasons (spec 11.2, PROPOSED payloads)", () => {
    expect(sessionEvent("opener.counts", { server_now: at, session_question_id: "o1", phase: "reasoning", votes: [4, 2, 20] })).toEqual({
      type: "opener.counts",
      serverNow: T0,
      sessionQuestionId: "o1",
      phase: "reasoning",
      votes: [4, 2, 20],
    });
    expect(sessionEvent("opener.reasons", { server_now: at, session_question_id: "o1", reasons: ["No air.", 7, "Same."] })).toEqual({
      type: "opener.reasons",
      serverNow: T0,
      sessionQuestionId: "o1",
      reasons: ["No air.", "Same."],
    });
  });

  it("reads a reveal with no right answer (a debate), and a result with no right or wrong", () => {
    expect(sessionEvent("question.revealed", { server_now: at, session_question_id: "d1", correct_answer: null })).toMatchObject({ correctAnswer: null, explanation: null });
    expect(
      sessionEvent("question.result", { server_now: at, session_question_id: "d1", correct: null, points: 8, reason_points: 8, session_rank: 2, session_points: 8, correct_answer: null }),
    ).toMatchObject({ result: { correct: null, points: 8, reasonPoints: 8 } });
  });

  it("lets the optional parts of an event be missing", () => {
    expect(sessionEvent("joined.count", { server_now: at, joined_count: 3 })).toMatchObject({ recent: [] });
    expect(sessionEvent("session.ended", { server_now: at })).toMatchObject({ summary: null, sessionPoints: null, sessionRank: null });
    expect(sessionEvent("question.revealed", { server_now: at, session_question_id: "q1", correct_answer: "1" })).toMatchObject({ explanation: null });
  });

  it("ignores events this build has no use for", () => {
    for (const type of ["join_token.rotated", "review.ready", "student.presence", "nudge", "whatever"]) {
      expect(sessionEvent(type, { server_now: at })).toBeNull();
    }
  });

  it("refuses an event that is not what the proposal says", () => {
    const bad = (type: string, data: unknown) => expect(() => sessionEvent(type, data), type).toThrow(ApiError);
    bad("state.changed", {});
    bad("state.changed", { server_now: "yesterday", state: "teaching" });
    bad("state.changed", { server_now: at });
    bad("question.opened", { server_now: at });
    bad("question.closed", { server_now: at });
    bad("question.progress", { server_now: at, session_question_id: "q1", answered: "many", joined: 2 });
    bad("opener.counts", { server_now: at, session_question_id: "o1", phase: "later", votes: [1] });
    bad("opener.counts", { server_now: at, session_question_id: "o1", phase: "voting", votes: "many" });
    bad("opener.counts", { server_now: at, session_question_id: "o1", phase: "voting", votes: [1, "2"] });
    bad("opener.reasons", { server_now: at, session_question_id: "o1" });
    bad("leaderboard.updated", { server_now: at, rows: "no" });
    bad("question.result", { server_now: at, session_question_id: "q1" });
  });

  it("covers every event type it lists", () => {
    for (const type of SESSION_EVENT_TYPES) {
      expect(() => sessionEvent(type, { server_now: at }), type).not.toThrow(RangeError);
    }
  });
});

describe("the student-state snapshot", () => {
  const base = {
    session: { id: "s1", course_id: "c1", state: "teaching" as const, lesson_title: "T", question_count: 5, joined_count: 20 },
    server_now: at,
    question: wireQ,
    my_response: "1",
    result: null,
    session_points: 13,
    session_rank: 4,
  };

  it("reads the shape of spec 11.3", () => {
    const s = studentState({ ...base, question: { ...wireQ, status: "open" } as never });
    expect(s).toMatchObject({ serverNow: T0, myResponse: "1", sessionPoints: 13, sessionRank: 4, board: null, progress: null, summary: null });
    expect(s.question).toMatchObject({ id: "q1", closesAt: T0 + 25_000 });
  });

  it("reads the proposed ranking, progress and summary when the server sends them", () => {
    const s = studentState({
      ...base,
      question: null,
      board: [{ student_id: "a", name: "Ана", points: 10, rank: 1 }],
      progress: { answered: 3, joined: 20 },
      summary: { right: 4, total: 5 },
    });
    expect(s).toMatchObject({ board: [{ studentId: "a", name: "Ана", points: 10, rank: 1 }], progress: { answered: 3, joined: 20 }, summary: { right: 4, total: 5 } });
  });

  it("reads the student's reason and the opener's phase, votes and reasons when the server sends them", () => {
    expect(studentState({ ...base, question: null })).toMatchObject({ myReason: null, opener: null });
    const s = studentState({
      ...base,
      my_reason: "No air.",
      opener: { phase: "reasoning", votes: [4, 2, 20], reasons: ["Same."] },
    });
    expect(s).toMatchObject({ myReason: "No air.", opener: { phase: "reasoning", votes: [4, 2, 20], reasons: ["Same."] } });
    // Votes can be left out while voting is open; the reasons can be missing too.
    expect(studentState({ ...base, opener: { phase: "voting", votes: null } as never }).opener).toEqual({ phase: "voting", votes: null, reasons: [] });
  });
});
