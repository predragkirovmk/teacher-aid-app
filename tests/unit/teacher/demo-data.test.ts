import { describe, expect, test } from "vitest";
import { buildWorld, DAY_MS, SCHOOLS, sessionBoard, type SeedSession } from "@/lib/teacher/api/mock-data";
import { isCorrect, POINTS_RIGHT, SPEED_BONUS_MAX } from "@/lib/teacher/scoring";
import type { SchoolType } from "@/lib/teacher/store";

// A fixed day, so the same demo is built every time.
const ANCHOR = new Date(2026, 9, 29).getTime();
const types: SchoolType[] = ["school", "university"];
const sessions = (type: SchoolType) => buildWorld(type, ANCHOR).sessions;
const each = (fn: (type: SchoolType, session: SeedSession) => void) => types.forEach((type) => sessions(type).forEach((session) => fn(type, session)));

describe("the demo school", () => {
  test("is Марија Петровска at a school, and the same teacher as a professor at a faculty", () => {
    expect(SCHOOLS.school.teacher.name).toBe("Марија Петровска");
    expect(SCHOOLS.university.teacher.name).toBe("Марија Петровска");
    expect(SCHOOLS.school.school.kind).toBe("gymnasium");
    expect(SCHOOLS.university.school.kind).toBe("faculty");
  });

  test("has no courses, rosters, subjects or years anywhere in its world", () => {
    for (const type of types) {
      const world = buildWorld(type, ANCHOR);
      expect(Object.keys(world).sort()).toEqual(["anchor", "def", "sessions", "students"]);
      const text = JSON.stringify(world);
      for (const word of ["course", "subject", "class_id", "joined_class_at", "year"]) expect(text, word).not.toContain(`"${word}`);
      expect(Object.keys(SCHOOLS[type]).sort()).toEqual(["colleagues", "held", "library", "novice", "pool", "prepared", "school", "teacher", "type"]);
    }
  });

  test("has a pool of 22 to 28 demo students, with names that are not repeated", () => {
    for (const type of types) {
      const { students } = buildWorld(type, ANCHOR);
      expect(students.length).toBeGreaterThanOrEqual(22);
      expect(students.length).toBeLessThanOrEqual(28);
      const names = students.map((s) => s.full_name);
      expect(new Set(names).size).toBe(names.length);
      for (const name of names) expect(name).toMatch(/^\p{Script=Cyrillic}+ \p{Script=Cyrillic}+$/u);
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
    expect(next.students.map((s) => s.full_name)).toEqual(a.students.map((s) => s.full_name));
    expect(next.sessions[5].started_at).not.toBe(a.sessions[5].started_at);
  });
});

describe("the history", () => {
  test("is 22 finished lessons at the school and 22 at the faculty, in the past, in order, on weekdays", () => {
    each((_, session) => {
      expect(session.started_at).toBeLessThan(ANCHOR);
      expect(session.ended_at).toBeGreaterThan(session.started_at);
      const day = new Date(session.started_at).getDay();
      expect(day === 0 || day === 6).toBe(false);
    });
    for (const type of types) {
      expect(sessions(type)).toHaveLength(22);
      const times = sessions(type).map((s) => s.started_at);
      expect(times).toEqual([...times].sort((a, b) => a - b));
      expect(new Set(sessions(type).map((s) => s.id)).size).toBe(22);
    }
  });

  test("every question closes before its lesson ends", () => {
    each((_, session) => {
      for (const q of session.questions) {
        expect(q.fired_at).toBeGreaterThan(session.started_at);
        expect(q.closes_at).toBeLessThanOrEqual(session.ended_at);
      }
    });
  });

  test("an answer is scored by the rules of spec 8: a wrong one 0, a right one 10 plus up to 5", () => {
    let right = 0;
    each((_, session) => {
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
    each((_, session) => {
      const questions = new Map(session.questions.map((q) => [q.id, q.question]));
      for (const a of session.answers) {
        const q = questions.get(a.question_id)!;
        expect(a.response).not.toBeNull();
        expect(isCorrect(q, a.response!), `${session.id} ${q.prompt}`).toBe(a.correct);
      }
    });
  });

  test("only students who joined answer, once per question, and not a skipped one", () => {
    each((_, session) => {
      const joined = new Map(session.joins.map((j) => [j.student_id, j.joined_at]));
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

  test("a finished lesson keeps only the students who were there: each once, none absent, none without a phone, none marked late", () => {
    for (const type of types) {
      const { students } = buildWorld(type, ANCHOR);
      const known = new Set(students.map((s) => s.id));
      for (const session of sessions(type)) {
        expect(session.joins.length).toBeGreaterThan(0);
        expect(session.joins.length).toBeLessThanOrEqual(students.length);
        expect(new Set(session.joins.map((j) => j.student_id)).size).toBe(session.joins.length);
        for (const j of session.joins) {
          expect(known.has(j.student_id)).toBe(true);
          expect(j.joined_at).toBeGreaterThanOrEqual(session.started_at);
          expect(j.joined_at).toBeLessThan(session.ended_at);
        }
        expect(JSON.stringify(session)).not.toMatch(/absent|present_no_device|no_device|"late"/);
      }
      // Some of the pool stayed away, and they are not in the lesson at all.
      expect(sessions(type).some((s) => s.joins.length < students.length)).toBe(true);
    }
  });

  test("a lesson's board ranks the students who joined from zero (BR-PTS-09)", () => {
    for (const type of types) {
      const world = buildWorld(type, ANCHOR);
      const session = world.sessions[0];
      const board = sessionBoard(world, session);
      expect(board.length).toBe(session.joins.length);
      expect(board[0].rank).toBe(1);
      expect(board.map((r) => r.points)).toEqual([...board.map((r) => r.points)].sort((a, b) => b - a));
    }
  });

  test("a skipped question scores nobody and is not in the practice set (BR-SKIP-01, BR-PRA-01)", () => {
    let skipped = 0;
    each((_, session) => {
      for (const q of session.questions.filter((x) => x.skipped)) {
        skipped++;
        expect(session.answers.some((a) => a.question_id === q.id)).toBe(false);
        expect(session.practice?.question_ids ?? []).not.toContain(q.id);
      }
    });
    expect(skipped).toBeGreaterThan(0);
  });

  test("a practice set goes to the students who were in the lesson (F-12)", () => {
    let sets = 0;
    each((_, session) => {
      if (!session.practice) return;
      sets++;
      expect(session.practice.results.map((r) => r.student_id).sort()).toEqual(session.joins.map((j) => j.student_id).sort());
    });
    expect(sets).toBeGreaterThan(0);
  });

  test("a question to the teacher is asked by a student who was in the lesson by then, and answered before it ends", () => {
    let asked = 0;
    each((_, session) => {
      const joined = new Map(session.joins.map((j) => [j.student_id, j.joined_at]));
      for (const a of session.anon) {
        asked++;
        const at = joined.get(a.sender_id);
        expect(at, `${a.id} was asked by someone who never joined`).toBeDefined();
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

  test("has a few practice sets with who did them, and questions to the teacher with who asked", () => {
    for (const type of types) {
      const all = sessions(type);
      const withPractice = all.filter((s) => s.practice);
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
      expect(all.some((s) => s.anon.length > 0)).toBe(true);
    }
  });

  test("the held lessons of a school are run several times each, and the prepared ones not at all", () => {
    for (const type of types) {
      const held = new Map<string, number>();
      for (const s of sessions(type)) held.set(s.lesson_key, (held.get(s.lesson_key) ?? 0) + 1);
      expect([...held.values()].some((n) => n >= 3)).toBe(true);
      for (const key of SCHOOLS[type].prepared) expect(held.has(key)).toBe(false);
    }
  });
});
