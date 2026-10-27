import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/app/api/errors";
import * as wire from "@/lib/app/api/wire";

const AT = "2026-10-12T09:40:00.000Z";
const AT_MS = Date.parse(AT);

describe("time", () => {
  it("reads ISO 8601 as milliseconds and writes it back", () => {
    expect(wire.ms(AT)).toBe(AT_MS);
    expect(wire.iso(AT_MS)).toBe(AT);
    expect(wire.ms(wire.iso(1_700_000_000_123))).toBe(1_700_000_000_123);
  });

  it("treats a malformed time as an invalid response, not a screen's problem", () => {
    expect(() => wire.ms("yesterday")).toThrow(ApiError);
    try {
      wire.ms("yesterday");
    } catch (e) {
      expect((e as ApiError).code).toBe("invalid_response");
    }
  });
});

describe("wire to domain", () => {
  it("maps the student from snake_case to camelCase", () => {
    const s = wire.student({
      id: "s1",
      full_name: "Марко Трајковски",
      school_email: "marko@student.example",
      display_name: null,
      photo_url: null,
      school: { id: "sc1", name: "Ѓорѓи Наумов" },
      class: { id: "c1", name: "7Б" },
      settings: { notifications_on: false, locale: "en" },
    });
    expect(s).toEqual({
      id: "s1",
      fullName: "Марко Трајковски",
      schoolEmail: "marko@student.example",
      displayName: null,
      photoUrl: null,
      school: { id: "sc1", name: "Ѓорѓи Наумов" },
      class: { id: "c1", name: "7Б" },
      settings: { notificationsOn: false, locale: "en" },
      acknowledgement: null,
    });
  });

  it("maps the notice a student acknowledged, and reads a server that does not send one as none", () => {
    const base = {
      id: "s1",
      full_name: "A B",
      school_email: "a@b.example",
      display_name: null,
      photo_url: null,
      school: { id: "sc1", name: "S" },
      class: { id: "c1", name: "7" },
      settings: { notifications_on: true, locale: "mk" as const },
    };
    expect(wire.student({ ...base, acknowledgement: { notice_version: "2026-10-27", acknowledged_at: "2026-10-27T08:00:00Z" } }).acknowledgement).toEqual({
      version: "2026-10-27",
      at: Date.parse("2026-10-27T08:00:00Z"),
    });
    expect(wire.student({ ...base, acknowledgement: null }).acknowledgement).toBeNull();
    expect(wire.student(base).acknowledgement).toBeNull();
  });

  it("maps the data summary, counts only", () => {
    expect(
      wire.dataSummary({
        attendance: 20,
        answers: 31,
        reasons: 2,
        questions_to_teacher: 1,
        focus_events: 3,
        practice_answers: 6,
        notifications: 9,
        push_subscription: true,
      }),
    ).toEqual({ attendance: 20, answers: 31, reasons: 2, questionsToTeacher: 1, focusEvents: 3, practiceAnswers: 6, notifications: 9, pushSubscription: true });
  });

  it("sends the acknowledgement as the version and nothing else", () => {
    expect(wire.acknowledgementBody("2026-10-27")).toEqual({ notice_version: "2026-10-27" });
  });

  it("maps a course", () => {
    expect(
      wire.course({ id: "k1", subject: { id: "math", name: "Математика" }, teacher: { name: "Ј. Милев" }, class: { id: "c1", name: "7Б" } }),
    ).toEqual({ id: "k1", subjectId: "math", subjectName: "Математика", teacherName: "Ј. Милев", classId: "c1", className: "7Б" });
  });

  it("maps attendance, keeping a missing join time and a missing week-ago figure as null", () => {
    const a = wire.attendance({
      attended: 20,
      total: 23,
      percent: 87,
      percent_week_ago: null,
      log: [
        { id: "a1", course_id: "k1", subject: { id: "math", name: "Математика" }, date: AT, status: "late", joined_at: null },
        { id: "a2", course_id: "k1", subject: { id: "math", name: "Математика" }, date: AT, status: "present", joined_at: AT },
      ],
    });
    expect(a.percentWeekAgo).toBeNull();
    expect(a.log[0]).toMatchObject({ courseId: "k1", subjectId: "math", date: AT_MS, status: "late", joinedAt: null });
    expect(a.log[1].joinedAt).toBe(AT_MS);
  });

  it("maps a result with its questions", () => {
    const r = wire.result({
      session_id: "se1",
      course_id: "k1",
      subject: { id: "math", name: "Математика" },
      lesson_title: "Равенки",
      ended_at: AT,
      right: 4,
      total: 5,
      questions: [{ id: "q1", prompt: "2+2", correct: false, correct_answer: "4", your_answer: null }],
    });
    expect(r).toMatchObject({ sessionId: "se1", courseId: "k1", subjectName: "Математика", lessonTitle: "Равенки", endedAt: AT_MS, right: 4, total: 5 });
    expect(r.questions[0]).toEqual({ id: "q1", prompt: "2+2", correct: false, correctAnswer: "4", yourAnswer: null });
  });

  it("maps a topic's points", () => {
    expect(wire.topic({ topic: "Равенки", subject_id: "math", points: [{ at: AT, right: 3, total: 4 }] })).toEqual({
      topic: "Равенки",
      subjectId: "math",
      points: [{ at: AT_MS, right: 3, total: 4 }],
    });
  });

  it("maps a leaderboard with and without a season", () => {
    const rows = [{ student_id: "s1", name: "Ана", points: 10, rank: 1, is_me: true }];
    const none = wire.leaderboard({ scope: "class", season: null, rows });
    expect(none.season).toBeNull();
    expect(none.rows[0]).toEqual({ studentId: "s1", name: "Ана", points: 10, rank: 1, isMe: true });

    const some = wire.leaderboard({
      scope: "school",
      season: { id: "se", school_year: "2026/27", semester: 1, starts_on: AT, ends_on: AT },
      rows,
    });
    expect(some.season).toEqual({ id: "se", schoolYear: "2026/27", semester: 1, startsOn: AT_MS, endsOn: AT_MS });
  });

  it("maps a badge", () => {
    expect(wire.badge({ code: "ontime", title: "On time", points: 20, earned: false, awarded_at: null })).toEqual({
      code: "ontime",
      title: "On time",
      points: 20,
      earned: false,
      awardedAt: null,
    });
  });

  describe("notification", () => {
    const base = { id: "n1", created_at: AT, read_at: null };

    it("maps the payload and the times", () => {
      const n = wire.notification({
        ...base,
        kind: "result_ready",
        payload: { course_id: "k1", subject_id: "math", subject_name: "Математика", session_id: "se1", right: 4, total: 5 },
      });
      expect(n).toMatchObject({
        id: "n1",
        kind: "result_ready",
        createdAt: AT_MS,
        readAt: null,
        payload: { courseId: "k1", subjectId: "math", subjectName: "Математика", sessionId: "se1", right: 4, total: 5 },
      });
    });

    it("turns a payload date into milliseconds and leaves an absent one undefined", () => {
      expect(wire.notification({ ...base, kind: "marked_late", payload: { date: AT } }).payload.date).toBe(AT_MS);
      expect(wire.notification({ ...base, kind: "marked_late", payload: {} }).payload.date).toBeUndefined();
    });

    it("shows a kind this build does not know as generic, with the server's own words", () => {
      const n = wire.notification({ ...base, kind: "homework_due", payload: { title: "T", body: "B" } });
      expect(n.kind).toBe("generic");
      expect(n.payload).toMatchObject({ title: "T", body: "B" });
    });

    it("keeps every known kind", () => {
      for (const kind of ["result_ready", "practice_set_sent", "marked_late", "badge_earned", "generic"]) {
        expect(wire.notification({ ...base, kind, payload: {} }).kind).toBe(kind);
      }
    });

    it("survives a missing payload and reads a read time", () => {
      const n = wire.notification({ ...base, kind: "generic", read_at: AT, payload: undefined as never });
      expect(n.readAt).toBe(AT_MS);
      expect(n.payload.title).toBeUndefined();
    });
  });

  it("maps a practice set with its progress, and an attempt with its verdicts", () => {
    const set = wire.practiceSet({
      id: "p1",
      session_id: "se1",
      course_id: "k1",
      subject_id: "math",
      lesson_title: "Fractions",
      created_at: AT,
      completed_at: null,
      score: 1,
      points: 5,
      questions: [
        {
          id: "q1",
          kind: "multiple_choice",
          prompt: "2+2",
          options: ["3", "4"],
          numeric: null,
          answer: { response: "1", correct: true, correct_answer: "1", explanation: "Two and two." },
        },
        { id: "q2", kind: "numeric", prompt: "7/4", options: null, numeric: { unit: "m", allow_negative: false }, answer: null },
      ],
    });
    expect(set).toMatchObject({ sessionId: "se1", courseId: "k1", subjectId: "math", lessonTitle: "Fractions", createdAt: AT_MS, completedAt: null, score: 1, points: 5 });
    expect(set.questions[0]).toEqual({
      id: "q1",
      kind: "multiple_choice",
      prompt: "2+2",
      options: ["3", "4"],
      numeric: null,
      answer: { response: "1", correct: true, correctAnswer: "1", explanation: "Two and two." },
    });
    expect(set.questions[1]).toMatchObject({ kind: "numeric", numeric: { unit: "m", allowNegative: false }, answer: null });

    expect(
      wire.practiceAttempt({
        score: 1,
        total: 2,
        points: 5,
        completed: false,
        results: [{ question_id: "q1", duplicate: false, correct: true, correct_answer: "1", explanation: null }],
      }),
    ).toEqual({
      score: 1,
      total: 2,
      points: 5,
      completed: false,
      results: [{ questionId: "q1", duplicate: false, correct: true, correctAnswer: "1", explanation: null }],
    });
  });

  it("maps a join with its server clock", () => {
    const j = wire.join({
      session: { id: "se1", course_id: "k1", state: "lobby", lesson_title: null, question_count: null, joined_count: 9 },
      attendance: { id: "a1", course_id: "k1", subject: { id: "math", name: "Математика" }, date: AT, status: "present", joined_at: AT },
      server_now: AT,
    });
    expect(j.session).toEqual({ id: "se1", courseId: "k1", state: "lobby", lessonTitle: null, questionCount: null, joinedCount: 9 });
    expect(j.serverNow).toBe(AT_MS);
    expect(j.attendance.joinedAt).toBe(AT_MS);
  });

  it("maps the student's session state, with and without a question", () => {
    const session = { id: "se1", course_id: "k1", state: "teaching" as const, lesson_title: "T", question_count: 5, joined_count: 20 };
    const idle = wire.studentState({
      session,
      server_now: AT,
      question: null,
      my_response: null,
      result: null,
      session_points: 0,
      session_rank: 1,
    });
    expect(idle.question).toBeNull();
    expect(idle.result).toBeNull();
    // A server that does not say how many questions to the teacher are left leaves the count unknown.
    expect(idle.anon).toBeNull();
    expect(
      wire.studentState({ session, server_now: AT, question: null, my_response: null, result: null, session_points: 0, session_rank: 1, anon_questions: { used: 1, limit: 3 } }).anon,
    ).toEqual({ used: 1, limit: 3 });

    const live = wire.studentState({
      session,
      server_now: AT,
      question: {
        id: "sq1",
        index: 0,
        total: 5,
        kind: "multiple_choice",
        prompt: "?",
        options: ["a", "b"],
        status: "open",
        timer_seconds: 20,
        fired_at: AT,
        closes_at: null,
      },
      my_response: "b",
      result: { session_question_id: "sq1", correct: true, points: 15, speed_bonus: 5, session_rank: 2, correct_answer: "b", explanation: null },
      session_points: 15,
      session_rank: 2,
    });
    expect(live.question).toMatchObject({ id: "sq1", timerSeconds: 20, firedAt: AT_MS, closesAt: null });
    expect(live.result).toEqual({ sessionQuestionId: "sq1", correct: true, points: 15, reasonPoints: 0, speedBonus: 5, sessionRank: 2, correctAnswer: "b", explanation: null });
    expect(live).toMatchObject({ myResponse: "b", sessionPoints: 15, sessionRank: 2 });
  });

  it("maps an answer receipt", () => {
    expect(wire.answerReceipt({ accepted: true, duplicate: true })).toEqual({ accepted: true, duplicate: true });
  });
});

describe("sign-in", () => {
  it("reads a code challenge, with its times as milliseconds", () => {
    expect(
      wire.signInChallenge({ method: "code", code_length: 6, expires_at: "2026-10-20T08:10:00.000Z", resend_at: "2026-10-20T08:00:30.000Z" }),
    ).toEqual({
      method: "code",
      codeLength: 6,
      expiresAt: Date.parse("2026-10-20T08:10:00.000Z"),
      resendAt: Date.parse("2026-10-20T08:00:30.000Z"),
    });
  });

  it("reads a redirect to the school's identity provider", () => {
    expect(wire.signInChallenge({ method: "redirect", url: "https://login.example/start" })).toEqual({
      method: "redirect",
      url: "https://login.example/start",
    });
  });

  it("treats a malformed time as an invalid response", () => {
    expect(() => wire.signInChallenge({ method: "code", code_length: 6, expires_at: "soon", resend_at: "later" })).toThrow(ApiError);
  });
});

describe("domain to wire (request bodies)", () => {
  it("sends only the settings that changed, in snake_case", () => {
    expect(wire.settingsBody({ notificationsOn: false })).toEqual({ notifications_on: false });
    expect(wire.settingsBody({ locale: "en" })).toEqual({ locale: "en" });
    expect(wire.settingsBody({ notificationsOn: true, locale: "mk" })).toEqual({ notifications_on: true, locale: "mk" });
    expect(wire.settingsBody({})).toEqual({});
  });

  it("keeps a false setting, which is a real choice and not an absent one", () => {
    expect(wire.settingsBody({ notificationsOn: false })).toHaveProperty("notifications_on", false);
  });

  it("writes an answer with its idempotency key and an ISO time", () => {
    expect(wire.answerBody({ sessionQuestionId: "sq1", response: "b", answeredAt: AT_MS, idempotencyKey: "k-1" })).toEqual({
      session_question_id: "sq1",
      response: "b",
      answered_at: AT,
      idempotency_key: "k-1",
    });
  });

  it("writes a question to the teacher with its text, the time it was written and its key", () => {
    expect(wire.askBody({ text: "Why?", askedAt: AT_MS, idempotencyKey: "k-3" })).toEqual({ text: "Why?", asked_at: AT, idempotency_key: "k-3" });
  });

  it("writes focus events as a bare array of a type, a time and a question, and nothing else", () => {
    const body = wire.focusBody([
      { type: "lost", at: AT_MS, sessionQuestionId: "sq1" },
      { type: "back", at: AT_MS + 5000, sessionQuestionId: "sq1" },
    ]);
    expect(body).toEqual([
      { type: "lost", at: AT, session_question_id: "sq1" },
      { type: "back", at: new Date(AT_MS + 5000).toISOString(), session_question_id: "sq1" },
    ]);
    for (const e of body) expect(Object.keys(e).sort()).toEqual(["at", "session_question_id", "type"]);
  });

  it("writes an opener vote like an answer and a reason with its text under `text`", () => {
    const input = { sessionQuestionId: "o1", response: "agree", answeredAt: AT_MS, idempotencyKey: "k-2" };
    expect(wire.voteBody(input)).toEqual({ session_question_id: "o1", response: "agree", answered_at: AT, idempotency_key: "k-2" });
    expect(wire.reasonBody({ ...input, response: "It changes the meaning." })).toEqual({
      session_question_id: "o1",
      text: "It changes the meaning.",
      answered_at: AT,
      idempotency_key: "k-2",
    });
  });
});
