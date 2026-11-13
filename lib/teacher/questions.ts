import { DEFAULT_TIMER_SECONDS, parseNumeric } from "./scoring";
import type {
  AdhocRequest,
  AnonQuestionItem,
  ConsoleQuestion,
  LeaderboardRow,
  PublicQuestion,
  QuestionKind,
  QuestionStatus,
  RevealCounts,
} from "./api/types";

/**
 * The rules of the questions of a live lesson that need no browser: what the panel offers next (4.2), the countdown on the server's clock, the bars
 * of a reveal, who is on the leaderboard, the quick question's checks, the order of the inbox and when the nudge is due. All of it is unit tested.
 */

// ---- The panel: what comes next ----------------------------------------------------------------------

/** The next question not yet sent, in the lesson's order. A question made on the spot is sent as it is made, so it is never one. */
export const nextUnsent = (questions: readonly ConsoleQuestion[]): ConsoleQuestion | null =>
  questions.find((q) => !q.adhoc && q.status === "ready") ?? null;

/**
 * The question the panel is about: the one that is open, else the one the teacher dealt with last (sent or skipped). Reading it from the
 * questions alone means a reload, or a second window, shows the same panel.
 */
export function currentQuestion(questions: readonly ConsoleQuestion[]): ConsoleQuestion | null {
  const open = questions.find((q) => q.status === "open");
  if (open) return open;
  let best: ConsoleQuestion | null = null;
  let bestAt = -Infinity;
  for (const q of questions) {
    if (q.status === "ready") continue;
    const at = Math.max(q.fired_at ? Date.parse(q.fired_at) : -Infinity, q.skipped_at ? Date.parse(q.skipped_at) : -Infinity);
    if (at >= bestAt) {
      best = q;
      bestAt = at;
    }
  }
  return best;
}

/**
 * What the panel shows, and so what the page's one main button does:
 * - nothing is open: send the next question (`next`; none left is said plainly), and `skipped` is the one just skipped, if that was the last thing done;
 * - open: no main button, a countdown and the way to skip;
 * - closed: show the right answer;
 * - revealed: the counts, and send the next (`next`, or none left). Moving on to the review is the next step of the build, not this one's.
 */
export type PanelStep =
  | { step: "send"; next: ConsoleQuestion | null; skipped: ConsoleQuestion | null }
  | { step: "open"; question: ConsoleQuestion }
  | { step: "closed"; question: ConsoleQuestion }
  | { step: "revealed"; question: ConsoleQuestion; next: ConsoleQuestion | null };

export function panelStep(questions: readonly ConsoleQuestion[]): PanelStep {
  const current = currentQuestion(questions);
  const next = nextUnsent(questions);
  if (current?.status === "open") return { step: "open", question: current };
  if (current?.status === "closed") return { step: "closed", question: current };
  if (current?.status === "revealed") return { step: "revealed", question: current, next };
  return { step: "send", next, skipped: current?.status === "skipped" ? current : null };
}

/** How a question is listed, in words: not sent, sent, the answer shown, skipped. */
export type ListStatus = "not_sent" | "sent" | "shown" | "skipped";
export const listStatus = (status: QuestionStatus): ListStatus =>
  status === "ready" ? "not_sent" : status === "revealed" ? "shown" : status === "skipped" ? "skipped" : "sent";

/**
 * Whether another question may be sent from the list: nothing is open, and the last one sent has had its answer shown or was skipped, so
 * the panel is never left holding a question nobody can reach. (The API only refuses a second open question, 4.2; this is the app's own care.)
 */
export const canSendAnother = (questions: readonly ConsoleQuestion[]): boolean =>
  !questions.some((q) => q.status === "open" || q.status === "closed");

// ---- The countdown, on the server's clock --------------------------------------------------------------

/** Whole seconds left until `closesAt`, on the server's clock as this computer carries it on (`offset` from `serverOffset`). Never below zero. */
export const secondsLeft = (closesAt: string, offset: number, now: number): number => Math.max(0, Math.ceil((Date.parse(closesAt) - (now + offset)) / 1000));

/** How much of the time is left, 1 at the start and 0 at the end, for the bar that shrinks. */
export function shareLeft(firedAt: string, closesAt: string, offset: number, now: number): number {
  const total = Date.parse(closesAt) - Date.parse(firedAt);
  if (!(total > 0)) return 0;
  return Math.min(1, Math.max(0, (Date.parse(closesAt) - (now + offset)) / total));
}

// ---- The reveal ------------------------------------------------------------------------------------------

/** A letter for an option: A, B, C, D. */
export const optionLetter = (index: number): string => String.fromCharCode(65 + index);

export type BarRow = {
  /** The response in the encoding of 3.2: the option's index, or "true" or "false". */
  key: string;
  count: number;
  /** Whole percent of the answers given; the rows add up to 100 whenever anyone answered. */
  percent: number;
  right: boolean;
};

/**
 * One bar per option for a multiple-choice or true/false question: how many chose it and what share of the answers that is. The shares are
 * whole numbers that add up to 100 (the largest remainders get the leftover), so the bars never read 99 or 101.
 */
export function barRows(kind: QuestionKind, optionCount: number, counts: RevealCounts, correct: string): BarRow[] {
  const keys = kind === "true_false" ? ["true", "false"] : Array.from({ length: optionCount }, (_, i) => String(i));
  const given = keys.map((k) => counts.by_response[k] ?? 0);
  const total = given.reduce((a, b) => a + b, 0);
  const exact = given.map((n) => (total > 0 ? (n / total) * 100 : 0));
  const floors = exact.map(Math.floor);
  let left = total > 0 ? 100 - floors.reduce((a, b) => a + b, 0) : 0;
  const byRemainder = exact.map((x, i) => ({ i, r: x - Math.floor(x) })).sort((a, b) => b.r - a.r || a.i - b.i);
  for (const { i } of byRemainder) {
    if (left <= 0) break;
    floors[i]++;
    left--;
  }
  return keys.map((key, i) => ({ key, count: given[i], percent: floors[i], right: key === correct }));
}

/** The counts of a numeric reveal: right, wrong and no answer, and how many were asked. */
export const numericSummary = (counts: RevealCounts) => ({ right: counts.right, wrong: counts.wrong, unanswered: counts.unanswered, total: counts.right + counts.wrong + counts.unanswered });

// ---- The leaderboard -------------------------------------------------------------------------------------

/** How many places the projector shows. */
export const BOARD_SHOWN = 5;
/** A tie at the last place is shown whole, but never more rows than this: the room must be able to read them. */
export const BOARD_MOST = 7;

/**
 * The first places of the session ranking (BR-PTS-09; a tie shares a rank and the next is skipped, 1, 2, 2, 4). Nobody with no points is shown. Students tied
 * at the last shown place are all shown (nobody is left out of a place they share), up to `BOARD_MOST` rows.
 */
export function topOfBoard(rows: readonly LeaderboardRow[], shown = BOARD_SHOWN): LeaderboardRow[] {
  const scored = rows.filter((r) => r.points > 0);
  return scored.filter((r) => r.rank <= shown).slice(0, BOARD_MOST);
}

// ---- What the projector shows of the lesson ---------------------------------------------------------------

export type ProjectedScreen = "between" | "open" | "closed" | "revealed" | "skipped";

/** Which screen the projector shows, from its snapshot: the question, if there is one, in the state it is in. */
export function projectedScreen(question: PublicQuestion | null, skipped: boolean, hasReveal: boolean): ProjectedScreen {
  if (!question) return "between";
  if (skipped || question.status === "skipped") return "skipped";
  if (question.status === "open") return "open";
  if (question.status === "revealed" && hasReveal) return "revealed";
  return "closed";
}

/** A prompt's size on the projector: the longer it is, the smaller, and never below a size that can be read from the back of a room. */
export function promptSize(length: number): "xl" | "l" | "m" {
  return length <= 80 ? "xl" : length <= 160 ? "l" : "m";
}

/** How long the longest answer is, for the size of the options and bars: the longer it is, the smaller, so four long answers still share one screen. */
export function optionFit(labels: readonly string[]): "a" | "b" | "c" {
  const longest = labels.reduce((n, l) => Math.max(n, l.length), 0);
  return longest <= 24 ? "a" : longest <= 40 ? "b" : "c";
}

// ---- The quick question (FR-POP-04, FR-POP-07) --------------------------------------------------------------

export const ADHOC_PROMPT_MAX = 200;
export const ADHOC_OPTION_MAX = 60;
export const ADHOC_OPTIONS_MIN = 2;
export const ADHOC_OPTIONS_MAX = 4;
/** BR-TIME-05: whole seconds from 5 to 300. */
export const ADHOC_SECONDS_MIN = 5;
export const ADHOC_SECONDS_MAX = 300;
export const UNIT_MAX = 20;

export type AdhocDraft = {
  kind: QuestionKind;
  prompt: string;
  /** Four boxes, as many as are filled count; the right one is the index of its box. */
  options: string[];
  /** The right answer: "true" or "false", the index of an option's box, or the number as typed. */
  correct: string;
  unit: string;
  /** The time as typed, in seconds. */
  seconds: string;
};

export type AdhocProblem = "prompt" | "prompt_long" | "options" | "option_long" | "correct" | "number" | "unit_long" | "time";

/** A fresh form: the kind the teacher last used would be the same for the whole lesson, so it begins with true or false, the shortest. */
export const emptyAdhoc = (kind: QuestionKind = "true_false"): AdhocDraft => ({
  kind,
  prompt: "",
  options: ["", "", "", ""],
  correct: "",
  unit: "",
  seconds: String(DEFAULT_TIMER_SECONDS[kind]),
});

/** The time a kind starts with, used when the teacher changes the kind and has not changed the time. */
export const defaultSeconds = (kind: QuestionKind): number => DEFAULT_TIMER_SECONDS[kind];

/** The checks, in the order the form shows its fields; the request when there is none. The numbers are the same as the editor's (BR-Q-01, BR-TIME-05). */
export function checkAdhoc(d: AdhocDraft): { ok: true; request: AdhocRequest } | { ok: false; problems: AdhocProblem[] } {
  const problems: AdhocProblem[] = [];
  const prompt = d.prompt.replace(/\s+/g, " ").trim();
  if (!prompt) problems.push("prompt");
  else if (prompt.length > ADHOC_PROMPT_MAX) problems.push("prompt_long");

  let options: string[] | undefined;
  let correct = d.correct;
  let numeric: AdhocRequest["numeric"];
  if (d.kind === "multiple_choice") {
    const slots = d.options.map((o) => o.replace(/\s+/g, " ").trim());
    options = slots.filter(Boolean);
    if (options.length < ADHOC_OPTIONS_MIN) problems.push("options");
    else if (options.some((o) => o.length > ADHOC_OPTION_MAX)) problems.push("option_long");
    const at = Number(d.correct);
    if (d.correct === "" || !Number.isInteger(at) || !slots[at]) problems.push("correct");
    else correct = String(slots.slice(0, at).filter(Boolean).length);
  } else if (d.kind === "true_false") {
    if (d.correct !== "true" && d.correct !== "false") problems.push("correct");
  } else {
    const n = parseNumeric(d.correct);
    if (n === null) problems.push(d.correct.trim() ? "number" : "correct");
    else {
      correct = String(n);
      const unit = d.unit.trim();
      if (unit.length > UNIT_MAX) problems.push("unit_long");
      numeric = { unit: unit || null, tolerance: 0, allow_negative: n < 0 };
    }
  }

  const seconds = Number(d.seconds);
  if (!/^\d+$/.test(d.seconds.trim()) || seconds < ADHOC_SECONDS_MIN || seconds > ADHOC_SECONDS_MAX) problems.push("time");

  if (problems.length > 0) return { ok: false, problems };
  return { ok: true, request: { kind: d.kind, prompt, ...(options ? { options } : {}), correct, timer_seconds: seconds, ...(numeric ? { numeric } : {}) } };
}

// ---- The inbox of anonymous questions (FR-ANON, FR-CON-03) ------------------------------------------------------

/**
 * The inbox in the order it is read: the ones not answered first, newest first, then the ones answered, newest first. Taking an answer back puts
 * the question where its time puts it.
 */
export function sortInbox(items: readonly AnonQuestionItem[]): AnonQuestionItem[] {
  return [...items].sort((a, b) => Number(a.answered_at !== null) - Number(b.answered_at !== null) || Date.parse(b.created_at) - Date.parse(a.created_at) || b.id.localeCompare(a.id));
}

/** How many have not been answered. */
export const unansweredCount = (items: readonly AnonQuestionItem[]): number => items.filter((i) => i.answered_at === null).length;

/** The ids of the questions in `now` that were not in `before`: what has just arrived. */
export const arrivedIds = (before: ReadonlySet<string>, now: readonly AnonQuestionItem[]): string[] => now.filter((i) => !before.has(i.id)).map((i) => i.id);

// ---- The nudge (FR-POP-06) -----------------------------------------------------------------------------------------

/**
 * How long a lesson in `teaching` may go without a question before the console says so (FR-POP-06; the interval is OPEN-16, PROPOSED 8 minutes).
 * The demo plays it much shorter (mock-live.ts).
 */
export const NUDGE_AFTER_SECONDS = 8 * 60;

/**
 * The seconds without a question when the nudge is due, or null: only while teaching, with nothing open or waiting for its answer to be shown,
 * a question still to send, and `idleSince` (the last time a question was sent, dealt with or the lesson began) long enough ago.
 */
export function nudgeIdle(input: { teaching: boolean; busy: boolean; unsent: boolean; idleSince: number; now: number; afterMs: number }): number | null {
  if (!input.teaching || input.busy || !input.unsent) return null;
  const idle = input.now - input.idleSince;
  return idle >= input.afterMs ? Math.floor(idle / 1000) : null;
}

/** The minutes the nudge says: whole, and at least one. */
export const nudgeMinutes = (idleSeconds: number): number => Math.max(1, Math.floor(idleSeconds / 60));
