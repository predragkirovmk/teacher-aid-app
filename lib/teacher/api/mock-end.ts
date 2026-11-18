import type { EndedSession } from "./mock-state";
import type { ConsoleSnapshot, ResultRow } from "./types";

/**
 * The end of a lesson in the demo (F-10). Ending freezes the class where the clock had it: the students who joined, each with their score
 * (`students`, worked out by the caller from the answers), and the numbers of the class, kept as they were because the class that was played
 * from the clock stops with the lesson.
 */

/** The lesson as it stands, written down: the console's snapshot at the moment of End. */
export function endedFrom(snapshot: ConsoleSnapshot, students: ResultRow[], endedAt: string): EndedSession {
  const { session } = snapshot;
  // The questions that were put to the class and have ended (a skipped one, one never sent and one still open have no result).
  const put = snapshot.questions.filter((q) => q.status === "revealed" && q.counts);
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
    lesson: session.lesson,
    started_at: session.started_at,
    ended_at: endedAt,
    students,
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
