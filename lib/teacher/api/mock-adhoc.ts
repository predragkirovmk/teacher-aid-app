import { isValidQuestion } from "../lessons";
import { ADHOC_PROMPT_MAX } from "../questions";
import type { AdhocRequest, Question } from "./types";

/**
 * A quick question (FR-POP-04, FR-POP-07) as the live lesson holds it: a question like the lesson's, made on the spot, with its answer. The request
 * is checked as a saved lesson's question is (BR-LES-17, BR-TIME-05), and a request the app never sends, a poll with no right answer, is refused here:
 * OPEN-14 is open and the screens ask for the right answer. Returns null for a request that is not valid.
 */
export function adhocQuestion(request: AdhocRequest, index: number, order: number): Question | null {
  if (!request || typeof request.prompt !== "string" || typeof request.correct !== "string") return null;
  const prompt = request.prompt.replace(/\s+/g, " ").trim();
  if (!prompt || prompt.length > ADHOC_PROMPT_MAX) return null;
  const base = { id: `adhoc-${index + 1}`, order, prompt, media: null, explanation: null, timer_seconds: request.timer_seconds, topic: "" };
  let question: Question;
  switch (request.kind) {
    case "true_false":
      question = { ...base, kind: "true_false", correct: request.correct as "true" | "false" };
      break;
    case "multiple_choice":
      if (!Array.isArray(request.options)) return null;
      question = { ...base, kind: "multiple_choice", options: request.options.map((o) => String(o).trim()), correct: request.correct };
      break;
    case "numeric":
      if (!request.numeric) return null;
      question = { ...base, kind: "numeric", correct: request.correct, tolerance: request.numeric.tolerance, unit: request.numeric.unit, allow_negative: request.numeric.allow_negative };
      break;
    default:
      return null;
  }
  return isValidQuestion(question) ? question : null;
}
