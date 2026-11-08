import { DRAFT_PENDING_MAX_SECONDS } from "../lessons";
import type { DemoDraft, DemoJob } from "./mock-state";
import type { DraftStatus, DraftSummary, LessonDraft } from "./types";

/**
 * The drafts of the mock: the job that writes one, as a promise about the clock; the status it has at any moment; and the wire
 * shapes made from it. Nothing here touches the browser. There is no worker in the demo, so nothing "finishes" in the background:
 * whenever a draft is read its status is worked out from the clock, which is why a reload in the middle of a wait finds the job
 * exactly where it would be, and why a test can move time by handing the mock another `now`.
 */

/** How long the demo's AI takes to write a lesson: long enough to see the wait, short enough not to be a chore. */
export const GENERATE_MS = 8000;
/** A refinement changes questions that are already there, so it is quicker. */
export const REFINE_MS = 3000;
/** An AI that cannot is not quicker to say so: it tries again, once, before it gives up (EC-LES-02), but the demo does not make a chore of it. */
export const FAIL_MS = 4000;

/** What the demo's words can make the AI do. A real teacher cannot trigger these; they are how the failure screens are tried. */
export const FAIL = /\[fail\]/i;
export const FAIL_ONCE = /\[fail-once\]/i;
export const SLOW = /\[slow\]/i;
export const STUCK = /\[stuck\]/i;

/**
 * The job for a draft that is about to be written from `words`. `[slow]` is an AI that never answers (the draft then fails at the
 * limit, BR-LES-09), `[stuck]` a worker that stopped and a server that broke that rule (the draft stays pending for good, for the
 * page's own limit, `DRAFT_STUCK_MS`), `[fail]` one that always fails, `[fail-once]` one that fails the first time a source is used and works after
 * (`runs` is how many times it has been used). `ms` is how long a success takes.
 */
export function startJob(words: string, runs: number, now: number, ms: number): DemoJob {
  const started_at = new Date(now).toISOString();
  if (STUCK.test(words)) return { started_at, done_at: null, outcome: "stuck" };
  if (SLOW.test(words)) return { started_at, done_at: null, outcome: "ready" };
  const fails = FAIL.test(words) || (FAIL_ONCE.test(words) && runs === 0);
  return { started_at, done_at: new Date(now + (fails ? FAIL_MS : ms)).toISOString(), outcome: fails ? "failed" : "ready" };
}

/** What the draft is doing at `now`. A job that has not answered by the limit has failed, and an answer that comes after it is thrown away. */
export function statusOf(draft: DemoDraft, now: number): DraftStatus {
  const job = draft.job;
  if (job === null) return "ready";
  if (job.outcome === "stuck") return "pending";
  const limit = Date.parse(job.started_at) + DRAFT_PENDING_MAX_SECONDS * 1000;
  const done = job.done_at === null ? null : Date.parse(job.done_at);
  if (done !== null && done <= limit && now >= done) return job.outcome;
  return now >= limit ? "failed" : "pending";
}

/** The wire shape (`GET /lessons/drafts/{id}`) of a draft at `now`: its content is null until it is ready (INTERPRETATION). */
export function toWire(draft: DemoDraft, now: number): LessonDraft {
  const base = {
    id: draft.id,
    source_id: draft.source_id,
    source: draft.source,
    subject: draft.subject,
    year: draft.year,
    emphasis: draft.emphasis,
    refinements: draft.refinements,
    previous_draft_id: draft.previous_draft_id,
    created_at: draft.created_at,
    updated_at: draft.updated_at,
    consumed_at: draft.consumed_at,
    lesson_id: draft.lesson_id,
  };
  const status = statusOf(draft, now);
  if (status === "ready") return { ...base, status, failure: null, ...draft.content };
  if (status === "failed") return { ...base, status, failure: "generation_failed", title: null, review_summary: null, questions: null };
  return { ...base, status, failure: null, title: null, review_summary: null, questions: null };
}

/**
 * The unsaved drafts, the latest of each chain, newest first (FR-LES-20). A draft is the latest of its chain when no draft that is
 * still held was made from it, so throwing away the newest one makes the one before it the latest again; and when the newest was
 * saved the chain is done and none of it is listed.
 */
export function latestUnsaved(drafts: readonly DemoDraft[]): DemoDraft[] {
  const madeFrom = new Set(drafts.map((d) => d.previous_draft_id).filter((id): id is string => id !== null));
  return drafts
    .filter((d) => d.consumed_at === null && !madeFrom.has(d.id))
    .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id, undefined, { numeric: true }));
}

/** One item of `GET /lessons/drafts`. */
export function toSummary(draft: DemoDraft, now: number): DraftSummary {
  const status = statusOf(draft, now);
  return {
    id: draft.id,
    status,
    failure: status === "failed" ? "generation_failed" : null,
    title: status === "ready" ? draft.content.title : null,
    subject: draft.subject,
    year: draft.year,
    question_count: status === "ready" ? draft.content.questions.length : null,
    refinements: draft.refinements,
    emphasis: draft.emphasis,
    source: draft.source,
    previous_draft_id: draft.previous_draft_id,
    lesson_id: draft.lesson_id,
    created_at: draft.created_at,
    updated_at: draft.updated_at,
  };
}

/** The most drafts the demo keeps. The oldest saved ones go first, then the oldest of the rest. */
export const MAX_DRAFTS = 20;

export function trimDrafts(drafts: readonly DemoDraft[]): DemoDraft[] {
  let kept = [...drafts];
  while (kept.length > MAX_DRAFTS) {
    const saved = kept.findIndex((d) => d.consumed_at !== null);
    kept = kept.filter((_, i) => i !== (saved >= 0 ? saved : 0));
  }
  return kept;
}
