import { translate, type Key } from "../../i18n";
import { formatNumeric, withUnit } from "../../numeric";
import type { Question, Text } from "../../quiz";
import type { Locale, SessionResult, TopicProgress } from "../types";
import { QUIZ, type SubjectId } from "./data";
import { QUIZZES } from "./quiz";
import type { AppState } from "./store";

/**
 * The student's past, as the mock server would have it: a few lessons played before the demo starts (so the
 * results list and the topic charts have something to show), the last maths lesson the demo has always started
 * with, and every live lesson played in the demo. A topic is the lesson's subject matter; the mock gives each
 * lesson one, so a topic's chart is the same topic over the lessons that covered it (FR-STU-05).
 */

const text = (locale: Locale, key: string) => translate(locale, key as Key);

/** An answer as a summary shows it: the option's words, true or false, or the number with its unit. */
export function answerText(q: Question, response: string, locale: Locale): string | null {
  if (q.kind === "tf") return text(locale, response === "true" ? "q.true" : "q.false");
  if (q.kind === "num") return withUnit(formatNumeric(response, locale), q.unit ?? null);
  return q.options[Number(response)]?.[locale] ?? null;
}

/** The right answer in the response encoding (spec 3.2). */
export const correctResponse = (q: Question): string => (q.kind === "mc" ? String(q.answer) : q.kind === "tf" ? (q.answer === 0 ? "true" : "false") : q.answer);

type SeedSession = {
  id: string;
  subject: SubjectId;
  /** A local time, the demo's. */
  at: string;
  /** Right or wrong for each of the lesson's five questions, in order. */
  outcomes: boolean[];
};

const T = true;
const F = false;

/**
 * Lessons played before the demo starts, each on the live lesson of its subject. Maths has three on linear equations,
 * getting better, so a topic chart has a line to draw; the rest have one or two.
 */
const SEED_SESSIONS: SeedSession[] = [
  { id: "session-math-eq-1", subject: "math", at: "2026-09-25T10:15", outcomes: [T, F, F, T, F] },
  { id: "session-math-eq-2", subject: "math", at: "2026-10-02T10:20", outcomes: [T, T, F, T, F] },
  { id: "session-math-eq-3", subject: "math", at: "2026-10-09T09:35", outcomes: [T, T, T, F, T] },
  { id: "session-phys-1", subject: "physics", at: "2026-10-05T11:10", outcomes: [T, F, F, T, T] },
  { id: "session-phys-2", subject: "physics", at: "2026-10-08T08:40", outcomes: [T, T, F, T, T] },
  { id: "session-mkd-1", subject: "mkd", at: "2026-10-08T12:00", outcomes: [T, T, F, T, F] },
  { id: "session-english-1", subject: "english", at: "2026-10-07T13:00", outcomes: [T, F, T, T, F] },
];

/** The topic the demo's first maths lesson was about; its questions are the older, fixed ones in i18n.ts. */
const FRACTIONS: Text = { mk: "Дропки", en: "Fractions" };

type Past = { result: SessionResult; topic: string };

function seeded(s: SeedSession, locale: Locale): Past {
  const quiz = QUIZZES[s.subject]!;
  const questions = quiz.questions.map((q, i) => ({
    id: q.id,
    prompt: q.text[locale],
    correct: s.outcomes[i],
    correctAnswer: answerText(q, correctResponse(q), locale) ?? "",
    yourAnswer: null,
  }));
  return {
    topic: quiz.title[locale],
    result: {
      sessionId: s.id,
      courseId: s.subject,
      subjectId: s.subject,
      subjectName: text(locale, `subj.${s.subject}`),
      lessonTitle: quiz.title[locale],
      endedAt: new Date(s.at).getTime(),
      right: s.outcomes.filter(Boolean).length,
      total: s.outcomes.length,
      questions,
    },
  };
}

/** Every finished session, newest first: the ones played in the demo, then the history the demo starts with. */
function pasts(state: AppState, locale: Locale): Past[] {
  const played = state.finished.map(
    (f): Past => ({
      topic: QUIZZES[f.courseId]?.title[locale] ?? f.lessonTitle,
      result: {
        sessionId: f.sessionId,
        courseId: f.courseId,
        subjectId: f.courseId,
        subjectName: text(locale, `subj.${f.courseId}`),
        lessonTitle: f.lessonTitle,
        endedAt: f.endedAt,
        right: f.right,
        total: f.total,
        questions: f.questions,
      },
    }),
  );
  const fractions: Past = {
    topic: FRACTIONS[locale],
    result: {
      sessionId: "session-math-1",
      courseId: "math",
      subjectId: "math",
      subjectName: text(locale, "subj.math"),
      lessonTitle: text(locale, "sum.lesson"),
      endedAt: new Date("2026-10-12T09:40").getTime(),
      right: QUIZ.filter((q) => q.correct).length,
      total: QUIZ.length,
      questions: QUIZ.map((q) => ({
        id: q.id,
        prompt: text(locale, `q.${q.id}`),
        correct: q.correct,
        correctAnswer: text(locale, `a.${q.id}`),
        yourAnswer: null,
      })),
    },
  };
  return [...played, fractions, ...SEED_SESSIONS.map((s) => seeded(s, locale))].sort((a, b) => b.result.endedAt - a.result.endedAt);
}

/** GET /me/results: newest first. */
export const buildResults = (state: AppState, locale: Locale): SessionResult[] => pasts(state, locale).map((p) => p.result);

/**
 * GET /me/topics: each topic with how the student did in each lesson that covered it, oldest first. Each point is a
 * lesson: the questions on the topic that were right and how many there were (FR-STU-05, own data only).
 */
export function buildTopics(state: AppState, locale: Locale): TopicProgress[] {
  const byTopic = new Map<string, TopicProgress>();
  // Oldest first, so every topic's points come out in time order.
  for (const { result, topic } of pasts(state, locale).reverse()) {
    const key = `${result.subjectId}:${topic}`;
    const entry = byTopic.get(key) ?? { topic, subjectId: result.subjectId, points: [] };
    entry.points.push({ at: result.endedAt, right: result.right, total: result.total });
    byTopic.set(key, entry);
  }
  return [...byTopic.values()];
}
