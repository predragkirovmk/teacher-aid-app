import { ApiError } from "../errors";
import { parseNumeric, withinTolerance } from "../../numeric";
import type { Question, Text } from "../../quiz";
import type { Locale, PracticeAnswer, PracticeAttempt, PracticeQuestion, PracticeSet, PracticeVerdict } from "../types";
import type { SubjectId } from "./data";
import { correctResponse } from "./history";
import { QUIZZES } from "./quiz";
import { actions, type AppState, type StoredPracticeSet } from "./store";

/**
 * Practice sets as the mock server plays them (spec F-12, 7.12). The questions come from the lessons' own: a set the
 * mock "teacher" sends after a lesson holds the questions the class missed (OPEN-08, rule below), and the right answers
 * stay here, on the server's side, until a question is answered.
 */

// ---- What goes into a set (OPEN-08, PROPOSED) -------------------------------------------------

/** A question goes into the set when at least this share of the class got it wrong or left it unanswered. */
export const PRACTICE_MISS_SHARE = 0.4;
/** A set has at least this many questions, topped up from the next most missed, as long as someone missed them. */
export const PRACTICE_MIN = 2;
/** And at most this many: a lesson has 5 to 8 pop-ups (BR-Q-02). */
export const PRACTICE_MAX = 8;

export type MissStat = { id: string; /** Students who got it wrong or left it unanswered. */ missed: number; /** Students who joined. */ joined: number };

/**
 * One set for the whole class from one lesson, in the order of the lesson (OPEN-08). Every pop-up that PRACTICE_MISS_SHARE of the class
 * missed; if that leaves fewer than PRACTICE_MIN, the next most missed are added, but a question nobody missed is never in a set. Ties go to
 * the earlier question. `stats` are the lesson's pop-ups in lesson order.
 */
export function pickPracticeQuestions(stats: MissStat[]): string[] {
  const ranked = stats
    .map((s, order) => ({ id: s.id, order, share: s.joined > 0 ? s.missed / s.joined : 0, missed: s.missed }))
    .filter((s) => s.missed > 0)
    .sort((a, b) => b.share - a.share || a.order - b.order);
  const wanted = Math.max(PRACTICE_MIN, ranked.filter((s) => s.share >= PRACTICE_MISS_SHARE).length);
  return ranked
    .slice(0, Math.min(wanted, PRACTICE_MAX))
    .sort((a, b) => a.order - b.order)
    .map((s) => s.id);
}

// ---- The questions ---------------------------------------------------------------------------------

const t = (mk: string, en: string): Text => ({ mk, en });
const opts = (...o: [Text, Text, Text, Text]) => o;
const num = (s: string): Text => t(s, s);

/** Questions on the demo's first maths lesson (fractions), the one the demo starts with; they are in no live lesson. */
const FRACTION_QUESTIONS: Question[] = [
  {
    id: "pf1",
    kind: "mc",
    text: t("Колку е 2/3 од 12?", "What is 2/3 of 12?"),
    options: opts(num("6"), num("8"), num("9"), num("10")),
    answer: 1,
    explanation: t("Подели 12 со 3 и добиваш 4. Тоа е 1/3, па 2/3 се 4 · 2 = 8.", "Divide 12 by 3 to get 4. That is 1/3, so 2/3 is 4 · 2 = 8."),
  },
  {
    id: "pf2",
    kind: "mc",
    text: t("Која е поголема: 5/6 или 4/5?", "Which is larger: 5/6 or 4/5?"),
    options: opts(num("5/6"), num("4/5"), t("Еднакви се", "They are equal"), t("Не може да се одреди", "You cannot tell")),
    answer: 0,
    explanation: t("Со заеднички именител 30: 5/6 = 25/30, а 4/5 = 24/30. Затоа 5/6 е поголема.", "With a common denominator of 30: 5/6 = 25/30 and 4/5 = 24/30. So 5/6 is larger."),
  },
  {
    id: "pf3",
    kind: "tf",
    text: t("Дропките 6/8 и 3/4 се еднакви.", "The fractions 6/8 and 3/4 are equal."),
    answer: 0,
    explanation: t("Подели ги броителот и именителот на 6/8 со 2 и добиваш 3/4.", "Divide the top and the bottom of 6/8 by 2 and you get 3/4."),
  },
  {
    id: "pf4",
    kind: "num",
    text: t("Колку е 3/4 од 20?", "What is 3/4 of 20?"),
    answer: "15",
    tolerance: 0,
    explanation: t("20 ÷ 4 = 5 е една четвртина. Три четвртини се 5 · 3 = 15.", "20 ÷ 4 = 5 is one quarter. Three quarters are 5 · 3 = 15."),
  },
];

const BANK = new Map<string, Question>(
  [...FRACTION_QUESTIONS, ...Object.values(QUIZZES).flatMap((quiz) => quiz?.questions ?? [])].map((q) => [q.id, q]),
);

/** A question by id, in this file's bank or any live lesson's. */
export const practiceDef = (id: string): Question | undefined => BANK.get(id);

// ---- The sets -----------------------------------------------------------------------------------------

type SeedSet = Omit<StoredPracticeSet, "lessonTitle" | "courseId"> & { courseId: SubjectId; lessonTitle: Text };

/** What the demo starts with: the fractions set the teacher sent after the first maths lesson, and an older, finished physics one. */
const SEED_SETS: SeedSet[] = [
  {
    id: "ps-session-math-1",
    sessionId: "session-math-1",
    courseId: "math",
    lessonTitle: t("Математика, дропки", "Mathematics, fractions"),
    createdAt: new Date("2026-10-12T10:30").getTime(),
    questionIds: ["pf1", "pf2", "pf3", "pf4"],
  },
  {
    id: "ps-session-phys-2",
    sessionId: "session-phys-2",
    courseId: "physics",
    lessonTitle: QUIZZES.physics!.title,
    createdAt: new Date("2026-10-08T10:00").getTime(),
    questionIds: ["p3", "p1", "p5"],
  },
];

/** What the student answered in the older physics set, and when they finished: two of three right. */
const SEED_ANSWERS: Record<string, { answers: Record<string, string>; completedAt: number }> = {
  "ps-session-phys-2": { answers: { p3: "-2", p1: "1", p5: "2" }, completedAt: new Date("2026-10-09T18:20").getTime() },
};

type SetOf = { id: string; sessionId: string; courseId: SubjectId; createdAt: number; questionIds: string[]; title: (l: Locale) => string };

/** Every set the student has: the ones sent after lessons played in the demo, then the ones the demo starts with. */
function setsOf(state: AppState): SetOf[] {
  const seeds = SEED_SETS.map((s) => ({ ...s, title: (l: Locale) => s.lessonTitle[l] }));
  const mine = state.practiceSets.map((s) => ({ ...s, title: () => s.lessonTitle }));
  return [...mine, ...seeds];
}

const answersOf = (state: AppState, id: string): Record<string, string> => ({ ...SEED_ANSWERS[id]?.answers, ...state.practiceAnswers[id] });
const completedAtOf = (state: AppState, id: string): number | null => state.practiceDone[id] ?? SEED_ANSWERS[id]?.completedAt ?? null;

/** Whether `response` is right for the question: the same option, the same side, or a number within the tolerance. */
export function isRightAnswer(q: Question, response: string): boolean {
  return q.kind === "num" ? withinTolerance(response, q.answer, q.tolerance) : response === correctResponse(q);
}

/**
 * What `response` is as the question keeps it, or null when the question cannot be answered with it (`validation_failed`). A number is read
 * whatever its separator and kept as plain text with a point, as the live API does (FR-ANS-02).
 */
function cleanResponse(q: Question, response: string): string | null {
  if (q.kind === "tf") return response === "true" || response === "false" ? response : null;
  if (q.kind === "mc") return /^[0-3]$/.test(response) ? response : null;
  const parsed = parseNumeric(response, q.allowNegative ?? false);
  return parsed.ok ? parsed.value : null;
}

const verdictOf = (q: Question, response: string, locale: Locale): PracticeVerdict => ({
  correct: isRightAnswer(q, response),
  correctAnswer: correctResponse(q),
  explanation: q.explanation?.[locale] ?? null,
});

function questionOf(q: Question, response: string | undefined, locale: Locale): PracticeQuestion {
  return {
    id: q.id,
    kind: q.kind === "mc" ? "multiple_choice" : q.kind === "num" ? "numeric" : "true_false",
    prompt: q.text[locale],
    options: q.kind === "mc" ? q.options.map((o) => o[locale]) : null,
    numeric: q.kind === "num" ? { unit: q.unit ?? null, allowNegative: q.allowNegative ?? false } : null,
    answer: response === undefined ? null : { response, ...verdictOf(q, response, locale) },
  };
}

/** GET /me/practice-sets: newest first, with the student's progress in each. */
export function buildPracticeSets(state: AppState, locale: Locale): PracticeSet[] {
  return setsOf(state)
    .map((s): PracticeSet => {
      const answers = answersOf(state, s.id);
      const questions = s.questionIds.flatMap((id) => {
        const def = practiceDef(id);
        return def ? [questionOf(def, answers[id], locale)] : [];
      });
      const right = questions.filter((q) => q.answer?.correct).length;
      const answered = questions.filter((q) => q.answer).length;
      return {
        id: s.id,
        sessionId: s.sessionId,
        courseId: s.courseId,
        subjectId: s.courseId,
        lessonTitle: s.title(locale),
        createdAt: s.createdAt,
        completedAt: completedAtOf(state, s.id),
        score: answered > 0 ? right : null,
        questions,
      };
    })
    .sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * POST /practice-sets/{id}/answers. The first answer to a question stands (a repeat is answered with the stored verdict, flagged
 * `duplicate`). Practice gives no points (BR-PTS-03). An answer the question cannot have is `validation_failed`, a question that
 * is not the set's `not_found`. Nothing is written if any answer is refused.
 */
export function answerPractice(state: AppState, id: string, answers: PracticeAnswer[], locale: Locale): PracticeAttempt {
  const set = setsOf(state).find((s) => s.id === id);
  if (!set) throw new ApiError("not_found");
  const held = answersOf(state, id);
  const fresh = new Map<string, string>();
  for (const a of answers) {
    const def = set.questionIds.includes(a.questionId) ? practiceDef(a.questionId) : undefined;
    if (!def) throw new ApiError("not_found");
    if (held[a.questionId] === undefined && !fresh.has(a.questionId)) {
      const clean = cleanResponse(def, a.response);
      if (clean === null) throw new ApiError("validation_failed");
      fresh.set(a.questionId, clean);
    }
  }
  const all = { ...held, ...Object.fromEntries(fresh) };
  const right = (qid: string) => (isRightAnswer(practiceDef(qid)!, all[qid]) ? 1 : 0);
  const completed = set.questionIds.every((qid) => all[qid] !== undefined);
  if (fresh.size > 0) {
    actions.answerPractice(id, Object.fromEntries(fresh), completed ? Date.now() : null);
  }
  const score = set.questionIds.reduce((n, qid) => n + (all[qid] === undefined ? 0 : right(qid)), 0);
  return {
    score,
    total: set.questionIds.length,
    completed,
    results: answers.map((a) => ({
      questionId: a.questionId,
      duplicate: held[a.questionId] !== undefined,
      ...verdictOf(practiceDef(a.questionId)!, all[a.questionId], locale),
    })),
  };
}
