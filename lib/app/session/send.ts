import { client } from "../api";
import type { AnswerInput, AnswerReceipt, Id, StudentSessionState } from "../api/types";

/**
 * The one place an answer leaves the app. Today it goes straight to the API; the offline outbox of
 * step 5 (IndexedDB, idempotency keys, retry on reconnect) wraps this function and nothing else.
 */
export function sendAnswer(sessionId: Id, answer: AnswerInput): Promise<AnswerReceipt> {
  return client.submitAnswer(sessionId, answer);
}

/** GET /sessions/{id}/student-state, the snapshot. */
export function getStudentState(sessionId: Id): Promise<StudentSessionState> {
  return client.getStudentState(sessionId);
}
