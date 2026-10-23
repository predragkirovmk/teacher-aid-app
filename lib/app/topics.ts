import type { TopicProgress } from "./api/types";

/** How many lessons a topic's chart shows: the latest ones. */
export const TOPIC_POINTS_MAX = 8;

export type TopicPoint = { at: number; right: number; total: number; /** Right answers as a whole percent of the questions. */ pct: number };

export const percent = (right: number, total: number) => (total > 0 ? Math.round((right / total) * 100) : 0);

/**
 * The lessons of a topic to draw, oldest first: only lessons that asked something, the latest `max` of them. The server lists a topic's
 * lessons in time order; this does not rely on it.
 */
export function topicSeries(topic: TopicProgress, max = TOPIC_POINTS_MAX): TopicPoint[] {
  return topic.points
    .filter((p) => p.total > 0)
    .sort((a, b) => a.at - b.at)
    .slice(-max)
    .map((p) => ({ ...p, pct: percent(p.right, p.total) }));
}

export type TopicTrend =
  /** One lesson so far: there is no line to draw. */
  | { kind: "one"; right: number; total: number }
  /** From the first percentage to the latest, over `n` lessons; `same` when they are equal. */
  | { kind: "range"; from: number; to: number; n: number }
  | { kind: "same"; pct: number; n: number };

/** What to say in words about a series: where it started and where it is, neither praised nor blamed. */
export function topicTrend(points: TopicPoint[]): TopicTrend | null {
  if (points.length === 0) return null;
  const first = points[0];
  const last = points[points.length - 1];
  if (points.length === 1) return { kind: "one", right: last.right, total: last.total };
  return first.pct === last.pct ? { kind: "same", pct: last.pct, n: points.length } : { kind: "range", from: first.pct, to: last.pct, n: points.length };
}

/** A topic's chart is worth drawing from two lessons on. */
export const drawable = (points: TopicPoint[]) => points.length >= 2;

/** The topics of one subject, the ones with the most recent lesson first. */
export function topicsOf(topics: TopicProgress[], subjectId: string): TopicProgress[] {
  const latest = (t: TopicProgress) => Math.max(0, ...t.points.map((p) => p.at));
  return topics.filter((t) => t.subjectId === subjectId && t.points.some((p) => p.total > 0)).sort((a, b) => latest(b) - latest(a));
}
