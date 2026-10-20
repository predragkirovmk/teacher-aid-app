import type { StudentSessionState, StudentStage } from "./types";

/**
 * Which of section 4.4's states a student is in, from one snapshot. The server owns the facts and
 * the app owns the picture, so the mapping lives here and works the same after a reconnect.
 */
export function stageOf(s: StudentSessionState): StudentStage {
  if (s.session.state === "ended") return "ended";
  if (s.session.state === "lobby") return "waiting_start";
  const q = s.question;
  if (!q || q.status === "skipped" || q.status === "ready") return "waiting_next";
  if (q.status === "open") return s.myResponse === null ? "answering" : "waiting_others";
  // Closed or revealed: this student's result. It may still be on its way a moment after close.
  if (!s.result) return "waiting_others";
  return s.result.correct ? "right" : "wrong";
}
