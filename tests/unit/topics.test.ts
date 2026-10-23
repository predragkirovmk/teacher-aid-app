import { describe, expect, it } from "vitest";
import type { TopicProgress } from "@/lib/app/api/types";
import { TOPIC_POINTS_MAX, drawable, percent, topicSeries, topicTrend, topicsOf } from "@/lib/app/topics";

const topic = (name: string, points: [number, number, number][], subjectId = "math"): TopicProgress => ({
  topic: name,
  subjectId,
  points: points.map(([at, right, total]) => ({ at, right, total })),
});

describe("a topic's series", () => {
  it("is oldest first, whatever order the server listed it in, with the share right", () => {
    const s = topicSeries(topic("t", [[30, 4, 5], [10, 2, 5], [20, 3, 4]]));
    expect(s.map((p) => p.at)).toEqual([10, 20, 30]);
    expect(s.map((p) => p.pct)).toEqual([40, 75, 80]);
  });

  it("leaves out a lesson that asked nothing on the topic, and keeps only the latest few", () => {
    const many = Array.from({ length: 12 }, (_, i): [number, number, number] => [i + 1, 1, 2]);
    expect(topicSeries(topic("t", [[1, 0, 0], ...many]))).toHaveLength(TOPIC_POINTS_MAX);
    expect(topicSeries(topic("t", [[1, 0, 0]]))).toEqual([]);
    expect(topicSeries(topic("t", many)).at(-1)!.at).toBe(12);
  });

  it("rounds a share to a whole percent and never divides by nothing", () => {
    expect(percent(1, 3)).toBe(33);
    expect(percent(2, 3)).toBe(67);
    expect(percent(0, 0)).toBe(0);
  });
});

describe("what is said about a series", () => {
  const trend = (points: [number, number, number][]) => topicTrend(topicSeries(topic("t", points)));

  it("says where it started and where it is, up or down", () => {
    expect(trend([[1, 2, 5], [2, 4, 5]])).toEqual({ kind: "range", from: 40, to: 80, n: 2 });
    expect(trend([[1, 4, 5], [2, 2, 5]])).toEqual({ kind: "range", from: 80, to: 40, n: 2 });
  });

  it("says the same when it has not moved, and just the lesson when there is one", () => {
    expect(trend([[1, 2, 5], [2, 4, 10], [3, 6, 15]])).toEqual({ kind: "same", pct: 40, n: 3 });
    expect(trend([[1, 3, 5]])).toEqual({ kind: "one", right: 3, total: 5 });
    expect(trend([])).toBeNull();
  });

  it("draws a line only from two lessons on", () => {
    expect(drawable(topicSeries(topic("t", [[1, 3, 5]])))).toBe(false);
    expect(drawable(topicSeries(topic("t", [[1, 3, 5], [2, 4, 5]])))).toBe(true);
  });
});

describe("the topics of one subject", () => {
  it("are that subject's own, the one with the latest lesson first, and none that asked nothing", () => {
    const all = [
      topic("old", [[10, 1, 2]]),
      topic("empty", [[50, 0, 0]]),
      topic("new", [[10, 1, 2], [40, 2, 2]]),
      topic("other subject", [[60, 1, 2]], "physics"),
    ];
    expect(topicsOf(all, "math").map((t) => t.topic)).toEqual(["new", "old"]);
  });
});
