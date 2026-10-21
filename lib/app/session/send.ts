import { client } from "../api";
import type { AnswerInput, AnswerReceipt, Id, StudentSessionState } from "../api/types";
import { requestBackgroundSync } from "./background-sync";
import { createOutbox } from "./outbox";
import { indexedDbStore } from "./outbox-store";

/**
 * The raw call, `POST /sessions/{id}/answers`. Nothing but the outbox calls it: an answer leaves the
 * app by being saved in the outbox, which sends it, and sends it again until the server has spoken.
 */
export function sendAnswer(sessionId: Id, answer: AnswerInput): Promise<AnswerReceipt> {
  return client.submitAnswer(sessionId, answer);
}

/** The phone's outbox of answers (spec F-08): IndexedDB, or memory where the browser will not give it. */
export const outbox = createOutbox({ store: indexedDbStore(), send: sendAnswer, onSaved: () => void requestBackgroundSync() });

/** GET /sessions/{id}/student-state, the snapshot. */
export function getStudentState(sessionId: Id): Promise<StudentSessionState> {
  return client.getStudentState(sessionId);
}
