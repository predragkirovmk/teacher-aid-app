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
      question: { id: "q1", index: 0, total: 5, kind: "multiple_choice", prompt: "2 + 2?", options: ["3", "4", "5", "6"], status: "open", timerSeconds: 25, firedAt: T0, closesAt: T0 + 25_000 },
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
      result: { sessionQuestionId: "q1", correct: true, points: 13, speedBonus: 3, sessionRank: 2, correctAnswer: null, explanation: null },
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

  it("lets the optional parts of an event be missing", () => {
    expect(sessionEvent("joined.count", { server_now: at, joined_count: 3 })).toMatchObject({ recent: [] });
    expect(sessionEvent("session.ended", { server_now: at })).toMatchObject({ summary: null, sessionPoints: null, sessionRank: null });
    expect(sessionEvent("question.revealed", { server_now: at, session_question_id: "q1", correct_answer: "1" })).toMatchObject({ explanation: null });
  });

  it("ignores events this build has no use for", () => {
    for (const type of ["opener.counts", "opener.reasons", "join_token.rotated", "review.ready", "student.presence", "nudge", "whatever"]) {
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
});
