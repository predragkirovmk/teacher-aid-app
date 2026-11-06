import { describe, expect, test } from "vitest";
import { buildWorld, DAY_MS, SCHOOLS, studentPoints, sessionBoard, type SeedCourse, type SeedSession } from "@/lib/teacher/api/mock-data";
import { isCorrect, POINTS_RIGHT, SPEED_BONUS_MAX } from "@/lib/teacher/scoring";
import type { SchoolType } from "@/lib/teacher/store";

// A fixed day, so the same demo is built every time.
const ANCHOR = new Date(2026, 9, 29).getTime();
const types: SchoolType[] = ["school", "university"];
const courses = (type: SchoolType) => buildWorld(type, ANCHOR).courses;
const each = (fn: (type: SchoolType, course: SeedCourse, session: SeedSession) => void) =>
  types.forEach((type) => courses(type).forEach((course) => course.sessions.forEach((session) => fn(type, course, session))));

describe("the demo school", () => {
  test("is Марија Петровска teaching four classes at a school, and the same teacher as a professor with four groups", () => {
    expect(SCHOOLS.school.teacher.name).toBe("Марија Петровска");
    expect(SCHOOLS.university.teacher.name).toBe("Марија Петровска");
    expect(SCHOOLS.school.school.kind).toBe("gymnasium");
    expect(SCHOOLS.university.school.kind).toBe("faculty");
    expect(courses("school").map((c) => c.def.name)).toEqual(["II-4", "III-5", "IV-1", "I-2"]);
    expect(courses("school").every((c) => c.def.subject.name === "Математика")).toBe(true);
    expect(courses("university")).toHaveLength(4);
  });

  test("has 22 to 28 students in every class, with names that are not repeated", () => {
    for (const type of types) {
      for (const course of courses(type)) {
        expect(course.students.length).toBeGreaterThanOrEqual(22);
        expect(course.students.length).toBeLessThanOrEqual(28);
        const names = course.students.map((s) => s.full_name);
        expect(new Set(names).size).toBe(names.length);
        for (const name of names) expect(name).toMatch(/^\p{Script=Cyrillic}+ \p{Script=Cyrillic}+$/u);
      }
    }
  });

  test("does not use the name of a real school", () => {
    const text = JSON.stringify(SCHOOLS);
    expect(text).not.toMatch(/Јосип Броз|Гоце Делчев|Орце Николов|Св\. ?Кирил|Св\. ?Климент|УКИМ|ПМФ/);
    expect(SCHOOLS.school.school.name).toContain("Светлина");
  });

  test("is the same every time for the same day, and moves with the day", () => {
    const a = buildWorld("school", ANCHOR);
    const again = buildWorld("school", ANCHOR);
    expect(again).toBe(a);
    const next = buildWorld("school", ANCHOR + DAY_MS);
    expect(next.courses[0].students.map((s) => s.full_name)).toEqual(a.courses[0].students.map((s) => s.full_name));
    expect(next.courses[0].sessions[5].started_at).not.toBe(a.courses[0].sessions[5].started_at);
  });
});

describe("the history", () => {
  test("is ten finished lessons for the first class, six for two more and none for the last, in the past, in order, on weekdays", () => {
    each((_, course, session) => {
      expect(session.started_at).toBeLessThan(ANCHOR);
      expect(session.ended_at).toBeGreaterThan(session.started_at);
      const day = new Date(session.started_at).getDay();
      expect(day === 0 || day === 6).toBe(false);
      expect(course.sessions).toHaveLength(course.def.lessons.length);
      expect([10, 6]).toContain(course.sessions.length);
    });
    for (const type of types) {
      for (const course of courses(type)) {
        const times = course.sessions.map((s) => s.started_at);
        expect(times).toEqual([...times].sort((a, b) => a - b));
      }
    }
  });

  test("every question closes before its lesson ends", () => {
    each((_, __, session) => {
      for (const q of session.questions) {
        expect(q.fired_at).toBeGreaterThan(session.started_at);
        expect(q.closes_at).toBeLessThanOrEqual(session.ended_at);
      }
    });
  });

  test("an answer is scored by the rules of spec 8: a wrong one 0, a right one 10 plus up to 5", () => {
    let right = 0;
    each((_, __, session) => {
      const timers = new Map(session.questions.map((q) => [q.id, q.question.timer_seconds * 1000]));
      for (const a of session.answers) {
        if (a.correct) {
          right++;
          expect(a.points).toBe(POINTS_RIGHT + a.speed_bonus);
          expect(a.speed_bonus).toBeGreaterThanOrEqual(0);
          expect(a.speed_bonus).toBeLessThanOrEqual(SPEED_BONUS_MAX);
          expect(timers.has(a.question_id)).toBe(true);
        } else {
          expect(a.points).toBe(0);
          expect(a.speed_bonus).toBe(0);
        }
      }
    });
    expect(right).toBeGreaterThan(1000);
  });

  test("an answer is right exactly when its response is right for the question", () => {
    each((_, __, session) => {
      const questions = new Map(session.questions.map((q) => [q.id, q.question]));
      for (const a of session.answers) {
        const q = questions.get(a.question_id)!;
        expect(a.response).not.toBeNull();
        expect(isCorrect(q, a.response!), `${session.id} ${q.prompt}`).toBe(a.correct);
      }
    });
  });

  test("only students who joined answer, once per question, and not a skipped one", () => {
    each((_, __, session) => {
      const joined = new Map(session.marks.filter((m) => m.status === "present" || m.status === "late").map((m) => [m.student_id, m.joined_at!]));
      const fired = new Map(session.questions.map((q) => [q.id, q]));
      const seen = new Set<string>();
      for (const a of session.answers) {
        expect(joined.has(a.student_id), "answered without joining").toBe(true);
        const q = fired.get(a.question_id)!;
        expect(q.skipped).toBe(false);
        expect(joined.get(a.student_id)!).toBeLessThanOrEqual(q.fired_at);
        const key = `${a.student_id}/${a.question_id}`;
        expect(seen.has(key)).toBe(false);
        seen.add(key);
      }
    });
  });

  test("a student marked present without a device, or absent, earns nothing and never joined (BR-ATT-01)", () => {
    let noDevice = 0;
    each((_, __, session) => {
      for (const m of session.marks) {
        if (m.status === "present_no_device") {
          noDevice++;
          expect(m.reason).not.toBeNull();
          expect(m.marked_by).toBe("teacher");
          expect(m.joined_at).toBeNull();
        }
        if (m.status === "present_no_device" || m.status === "absent") expect(session.answers.some((a) => a.student_id === m.student_id)).toBe(false);
        if (m.status !== "present_no_device") expect(m.reason).toBeNull();
      }
    });
    expect(noDevice).toBeGreaterThan(0);
  });

  test("covers every status, and every student has one mark per lesson they were enrolled for", () => {
    for (const type of types) {
      const statuses = new Set(courses(type).flatMap((c) => c.sessions.flatMap((s) => s.marks.map((m) => m.status))));
      expect(statuses).toEqual(new Set(["present", "late", "absent", "present_no_device"]));
      for (const course of courses(type)) {
        for (const session of course.sessions) {
          const enrolled = course.students.filter((s) => s.joined_class_at === null || s.joined_class_at <= session.started_at);
          expect(session.marks.map((m) => m.student_id).sort()).toEqual(enrolled.map((s) => s.id).sort());
        }
      }
    }
  });

  test("a student who joined partway through the year has no marks before they joined", () => {
    const iv = courses("school")[2];
    const joiner = iv.students.find((s) => s.joined_class_at !== null)!;
    expect(joiner).toBeDefined();
    const marked = iv.sessions.filter((s) => s.marks.some((m) => m.student_id === joiner.id));
    expect(marked.length).toBeGreaterThan(0);
    expect(marked.length).toBeLessThan(iv.sessions.length);
    for (const s of iv.sessions) if (s.started_at < joiner.joined_class_at!) expect(s.marks.some((m) => m.student_id === joiner.id)).toBe(false);
  });

  test("a student's points are the sum of their answers, and the lesson's board ranks them from zero (BR-PTS-09)", () => {
    for (const course of courses("school").filter((c) => c.sessions.length > 0)) {
      for (const s of course.students) {
        const total = course.sessions.flatMap((x) => x.answers).filter((a) => a.student_id === s.id).reduce((t, a) => t + a.points, 0);
        expect(studentPoints(course, s.id)).toBe(total);
      }
      const session = course.sessions[0];
      const board = sessionBoard(course, session);
      expect(board.length).toBe(session.marks.filter((m) => m.status === "present" || m.status === "late").length);
      expect(board[0].rank).toBe(1);
      expect(board.map((r) => r.points)).toEqual([...board.map((r) => r.points)].sort((a, b) => b - a));
    }
  });

  test("a skipped question scores nobody and is not in the practice set (BR-SKIP-01, BR-PRA-01)", () => {
    let skipped = 0;
    each((_, __, session) => {
      for (const q of session.questions.filter((x) => x.skipped)) {
        skipped++;
        expect(session.answers.some((a) => a.question_id === q.id)).toBe(false);
        expect(session.practice?.question_ids ?? []).not.toContain(q.id);
      }
    });
    expect(skipped).toBeGreaterThan(0);
  });

  test("a practice set goes to everyone enrolled for the lesson, those who missed it included (F-12)", () => {
    let sets = 0;
    each((_, __, session) => {
      if (!session.practice) return;
      sets++;
      expect(session.practice.results.map((r) => r.student_id).sort()).toEqual(session.marks.map((m) => m.student_id).sort());
    });
    expect(sets).toBeGreaterThan(0);
  });

  test("a question to the teacher is asked by a student who was in the lesson by then, and answered before it ends", () => {
    let asked = 0;
    each((_, __, session) => {
      const joined = new Map(session.marks.map((m) => [m.student_id, m.joined_at]));
      for (const a of session.anon) {
        asked++;
        const at = joined.get(a.sender_id);
        expect(at, `${a.id} was asked by someone who never joined`).not.toBeNull();
        expect(at!).toBeLessThanOrEqual(a.created_at);
        expect(a.created_at).toBeLessThan(session.ended_at);
        if (a.answered_at !== null) {
          expect(a.answered_at).toBeGreaterThan(a.created_at);
          expect(a.answered_at).toBeLessThanOrEqual(session.ended_at);
        }
      }
    });
    expect(asked).toBeGreaterThan(0);
  });

  test("every reason for a student without a working device is in the history (F-11)", () => {
    const reasons = new Set<string>();
    each((_, __, session) => session.marks.forEach((m) => m.reason && reasons.add(m.reason)));
    expect(reasons).toEqual(new Set(["no_phone", "battery", "no_data", "no_focus_authorization"]));
  });

  test("has a few practice sets with who did them, and questions to the teacher with who asked", () => {
    for (const type of types) {
      const sessions = courses(type).flatMap((c) => c.sessions);
      const withPractice = sessions.filter((s) => s.practice);
      expect(withPractice.length).toBeGreaterThanOrEqual(2);
      for (const s of withPractice) {
        const p = s.practice!;
        expect(p.question_ids.length).toBeGreaterThanOrEqual(1);
        expect(p.question_ids.length).toBeLessThanOrEqual(8);
        expect(p.created_at).toBeGreaterThan(s.ended_at);
        for (const r of p.results) {
          expect(r.completed_at === null).toBe(r.score === null);
          if (r.completed_at !== null) {
            expect(r.completed_at).toBeGreaterThan(p.created_at);
            expect(r.score!).toBeLessThanOrEqual(p.question_ids.length);
          }
        }
      }
      expect(sessions.some((s) => s.anon.length > 0)).toBe(true);
    }
  });
});
