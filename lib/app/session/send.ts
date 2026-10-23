import { client } from "../api";
import type { AnswerInput, AnswerReceipt, Id, StudentSessionState, SubmissionKind } from "../api/types";
import { requestBackgroundSync } from "./background-sync";
import { createFocusQueue, localFocusStore } from "./focus-queue";
import { createOutbox } from "./outbox";
import { indexedDbStore } from "./outbox-store";

/**
 * The raw call: `POST /sessions/{id}/answers`, or the opener's `/opener/vote` and `/opener/reason`, or `/anon-questions`, or a practice set's `/answers`. Nothing
 * but the outbox calls it: an answer leaves the app by being saved in the outbox, which sends it, and sends
 * it again until the server has spoken.
 */
export async function sendAnswer(sessionId: Id, answer: AnswerInput, kind: SubmissionKind): Promise<AnswerReceipt> {
  switch (kind) {
    case "vote":
      return client.submitVote(sessionId, answer);
    case "reason":
      return client.submitReason(sessionId, answer);
    // An answer in a practice set: `sessionId` is the set's id, and the receipt carries the server's verdict on it.
    case "practice": {
      const attempt = await client.submitPracticeAnswers(sessionId, [{ questionId: answer.sessionQuestionId, response: answer.response }]);
      return { accepted: true, duplicate: attempt.results[0]?.duplicate ?? false, practice: attempt };
    }
    // A question to the teacher is an answer to nothing: its text is `response`, its time the time it was written.
    case "ask":
      return client.submitAsk(sessionId, { text: answer.response, askedAt: answer.answeredAt, idempotencyKey: answer.idempotencyKey });
    default:
      return client.submitAnswer(sessionId, answer);
  }
}

/** The phone's outbox of answers and questions to the teacher (spec F-08, F-09): IndexedDB, or memory where the browser will not give it. */
export const outbox = createOutbox({ store: indexedDbStore(), send: sendAnswer, onSaved: () => void requestBackgroundSync() });

/** The focus events on their way to the teacher's console (spec 7.10): kept on the phone and sent in batches, again until the server has them. */
export const focusQueue = createFocusQueue({ store: localFocusStore(), send: (sessionId, events) => client.sendFocusEvents(sessionId, events) });

/** GET /sessions/{id}/student-state, the snapshot. */
export function getStudentState(sessionId: Id): Promise<StudentSessionState> {
  return client.getStudentState(sessionId);
}
