import { hasJoined } from "../live";
import { rng } from "./mock-data";
import { missedOfQuestions } from "../review";
import type { EndedSession, PracticeRecord } from "./mock-state";
import type { AttendanceRow, ConsoleSnapshot, MissedQuestion, PracticeResults } from "./types";

/**
 * The end of a lesson in the demo (F-10, F-12). Ending freezes the class where the clock had it: who joined, who joined late, who was marked present
 * without a phone with the reason they were given, and who never came (absent, written by the system). The questions the class missed and the ones it
 * wrote are kept as they were, because the class that was played from the clock stops with the lesson.
 */

/** The lesson as it stands, written down: the console's snapshot at the moment of End. */
export function endedFrom(snapshot: ConsoleSnapshot, endedAt: string): EndedSession {
  const attendance: AttendanceRow[] = snapshot.students.map((s) => ({
    student_id: s.id,
    full_name: s.full_name,
    // A student who is neither here nor marked is absent, written by the system (F-10).
    status: s.attendance ?? "absent",
    joined_at: hasJoined(s) ? s.joined_at : null,
    no_device_reason: s.attendance === "present_no_device" ? s.no_device_reason : null,
    marked_by: hasJoined(s) ? "student" : s.attendance === "present_no_device" ? "teacher" : "system",
  }));
  const { session } = snapshot;
  // The questions that were put to the class and have closed (a skipped one, one never sent and one still open have no result).
  const put = snapshot.questions.filter((q) => (q.status === "closed" || q.status === "revealed") && q.counts);
  const joined = put.reduce((n, q) => n + q.joined, 0);
  const given = put.reduce((n, q) => n + q.counts!.right + q.counts!.wrong, 0);
  const right = put.reduce((n, q) => n + q.counts!.right, 0);
  const topics = new Map<string, { right: number; total: number }>();
  for (const q of put) {
    const topic = q.question.topic.trim() || session.lesson.title;
    const t = topics.get(topic) ?? { right: 0, total: 0 };
    t.right += q.counts!.right;
    t.total += q.counts!.right + q.counts!.wrong + q.counts!.unanswered;
    topics.set(topic, t);
  }
  return {
    id: session.id,
    course_id: session.course_id,
    lesson: session.lesson,
    started_at: session.started_at,
    ended_at: endedAt,
    attendance,
    most_missed: missedOfQuestions(snapshot.questions, session.lesson.title),
    anon_questions: snapshot.anon_questions,
    results: {
      question_count: put.length,
      participation: joined ? Math.round((given / joined) * 100) / 100 : 0,
      right_rate: given ? Math.round((right / given) * 100) / 100 : 0,
      points: snapshot.students.reduce((n, s) => n + s.points, 0),
      topics: [...topics].map(([topic, v]) => ({ topic, ...v })),
      focus: snapshot.focus_flags,
    },
  };
}

// ---- The practice set, done by the class over time -----------------------------------------------------

/** The first student finishes a good half minute after the set is sent, the last well over a quarter of an hour: so a demo shows some, then more. */
export const PRACTICE_FIRST_MS = 25_000;
export const PRACTICE_SPREAD_MS = 20 * 60_000;

/**
 * Who has done the set at `now` (FR-PRA-10): every enrolled student, in the register's order as the API sends it. Whether a student does it, when and with
 * how many right is worked out from the set's id, so two windows and a reload agree. A student who was in the lesson is likelier to; none of it gives points.
 */
export function practiceResultsAt(
  record: PracticeRecord,
  attendance: readonly Pick<AttendanceRow, "student_id" | "full_name" | "status">[],
  now: number,
): PracticeResults["students"] {
  const created = Date.parse(record.created_at);
  const count = record.question_ids.length;
  return attendance.map((a) => {
    const r = rng(`${record.id}/${a.student_id}`);
    const chance = a.status === "absent" ? 0.3 : 0.65;
    const does = r() < chance;
    const at = created + PRACTICE_FIRST_MS + Math.round(r() * PRACTICE_SPREAD_MS);
    let score = 0;
    for (let i = 0; i < count; i++) if (r() < 0.7) score++;
    const done = does && at <= now;
    return { student_id: a.student_id, full_name: a.full_name, score: done ? score : null, completed_at: done ? new Date(at).toISOString() : null };
  });
}

export const questionIds = (missed: readonly MissedQuestion[]): string[] => missed.map((m) => m.session_question_id);
