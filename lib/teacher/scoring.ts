import type { Id, LeaderboardRow, Question, QuestionKind } from "./api/types";

/**
 * The scoring and selection rules of spec section 8, as pure functions. The server is the authority
 * for all of them (hard rule 5); the mock adapter uses them to make a demo school whose numbers add
 * up, and the screens use the constants to say what a right answer is worth. Every value is a named
 * constant because most are PROPOSED (0.3) and may change without a migration.
 */

/** BR-PTS-02: a right answer; a wrong or missing one scores nothing. */
export const POINTS_RIGHT = 10;
/** BR-PTS-02, BR-PTS-04: the most a right answer can earn on top, for speed. */
export const SPEED_BONUS_MAX = 5;
/** BR-PTS-08: what a badge is worth (PROPOSED). */
export const POINTS_BADGE = 20;
/** BR-NET-03: an answer counts if it was given up to this long after the question closed (PROPOSED). */
export const ANSWER_GRACE_MS = 2000;

/** BR-Q-02. */
export const QUESTIONS_MIN = 5;
export const QUESTIONS_MAX = 8;

/** BR-PRA-01 (PROPOSED, OPEN-08): the share of joined students who must have missed a question for it to go in the practice set. */
export const PRACTICE_MISS_SHARE = 0.4;
export const PRACTICE_MIN = 2;
export const PRACTICE_MAX = QUESTIONS_MAX;

/** BR-TIME-01 (PROPOSED): recall and true/false 15 s, multiple choice 25 s, numeric 45 s. */
export const DEFAULT_TIMER_SECONDS: Record<QuestionKind, number> = { true_false: 15, multiple_choice: 25, numeric: 45 };
export const defaultTimerSeconds = (kind: QuestionKind) => DEFAULT_TIMER_SECONDS[kind];

/** BR-PTS-04: round(5 x time remaining / duration), from 5 at the moment the question opens to 0 at its close. */
export function speedBonus(remainingMs: number, durationMs: number): number {
  if (!(durationMs > 0)) return 0;
  const share = Math.min(1, Math.max(0, remainingMs / durationMs));
  return Math.round(SPEED_BONUS_MAX * share);
}

export type Score = { points: number; speed_bonus: number };

/**
 * What one answer earns. Only a right answer scores, and the bonus only while the course has it on (BR-PTS-04).
 * `remainingMs` is how long was left on the question's clock when the answer was given; an answer inside the grace
 * window after the close has none left and earns no bonus.
 */
export function scoreAnswer(input: { correct: boolean; remainingMs: number; durationMs: number; speedBonusOn: boolean }): Score {
  if (!input.correct) return { points: 0, speed_bonus: 0 };
  const bonus = input.speedBonusOn ? speedBonus(input.remainingMs, input.durationMs) : 0;
  return { points: POINTS_RIGHT + bonus, speed_bonus: bonus };
}

/** BR-NET-03: an answer is judged by when it was given, not when it arrived. */
export const answerInTime = (answeredAtMs: number, closesAtMs: number) => answeredAtMs <= closesAtMs + ANSWER_GRACE_MS;

/**
 * BR-ANS-03: a response is at most 15 digits, with an optional minus and one separator, a comma or a point (FR-ANS-02),
 * and no thousands separator or spaces. Returns the number, or null for text that is not one.
 */
export function parseNumeric(text: string): number | null {
  const s = text.trim();
  if (!/^-?\d+(?:[.,]\d+)?$|^-?[.,]\d+$/.test(s)) return null;
  if (s.replace(/\D/g, "").length > 15) return null;
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** BR-ANS-03: right when `abs(response - correct) <= tolerance`, the edges included (AC-ANS-04). */
export function withinTolerance(response: number, correct: number, tolerance: number): boolean {
  // A difference such as 0.4 - 0.3 is a hair over 0.1 in binary; the edge must still count.
  const slack = 1e-9 * Math.max(1, Math.abs(response), Math.abs(correct));
  return Math.abs(response - correct) <= tolerance + slack;
}

/**
 * Whether a response is right for a question (BR-ANS-01). `response` is in the encoding of 3.2. A response the question
 * cannot have is simply not right here; the server answers it `validation_failed` before it gets this far.
 */
export function isCorrect(question: Question, response: string): boolean {
  if (question.kind !== "numeric") return response === question.correct;
  const answer = parseNumeric(response);
  const correct = parseNumeric(question.correct);
  if (answer === null || correct === null) return false;
  if (answer < 0 && !question.allow_negative) return false;
  return withinTolerance(answer, correct, question.tolerance);
}

/**
 * The session ranking (BR-PTS-09), best first. A tie shares a rank and the next rank is skipped (1, 2, 2, 4); the spec leaves
 * this open (OPEN-20), and it is the reading that can be changed to a tie-breaker without moving anyone else.
 */
export function rankRows(rows: { student_id: Id; name: string; points: number }[]): LeaderboardRow[] {
  const sorted = [...rows].sort((a, b) => b.points - a.points || a.name.localeCompare(b.name, "mk"));
  const ranked: LeaderboardRow[] = [];
  sorted.forEach((row, i) => {
    ranked.push({ ...row, rank: i > 0 && sorted[i - 1].points === row.points ? ranked[i - 1].rank : i + 1 });
  });
  return ranked;
}

export type PracticeCandidate = {
  id: Id;
  /** Position in the lesson. */
  order: number;
  skipped: boolean;
  /** Students who had joined. */
  joined: number;
  /** Wrong or unanswered, among those. */
  missed: number;
};

/**
 * BR-PRA-01: the questions that go into a session's practice set, in lesson order. Those missed by at least
 * PRACTICE_MISS_SHARE of the students who joined; if that leaves fewer than PRACTICE_MIN, the next most missed are added,
 * but a question nobody missed never is, nor a skipped one; at most PRACTICE_MAX. Empty when nothing was missed.
 */
export function selectPracticeQuestions(candidates: PracticeCandidate[]): Id[] {
  const share = (c: PracticeCandidate) => (c.joined > 0 ? c.missed / c.joined : 0);
  const missed = candidates.filter((c) => !c.skipped && c.missed > 0).sort((a, b) => share(b) - share(a) || a.order - b.order);
  const chosen = missed.filter((c) => share(c) >= PRACTICE_MISS_SHARE);
  for (const c of missed) {
    if (chosen.length >= PRACTICE_MIN) break;
    if (!chosen.includes(c)) chosen.push(c);
  }
  return chosen
    .slice(0, PRACTICE_MAX)
    .sort((a, b) => a.order - b.order)
    .map((c) => c.id);
}
