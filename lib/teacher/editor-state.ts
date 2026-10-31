import type { DraftPatch, DraftQuestion, QuestionKind, ReadyDraft } from "./api/types";
import {
  addQuestion,
  changeKind,
  contentOf,
  moveQuestion,
  parseTolerance,
  parseWhole,
  removeQuestion,
  replaceQuestion,
  restoreQuestion,
  type DraftContent,
  type RawText,
  type Removed,
} from "./editor";

/**
 * What the editor of a draft holds while the teacher works: the lesson as it now is, the numbers typed that are not numbers yet,
 * which question is open (one at a time), what was deleted last (so that it can be brought back), and whether the choice of a kind
 * for a new question is showing. Every change is an action, and `reduce` is pure: a change that changes nothing returns the same
 * state, so the page can tell, by identity, whether there is anything to save.
 */
export type EditorState = {
  content: DraftContent;
  raw: RawText;
  open: string | null;
  removed: Removed | null;
  adding: boolean;
};

export const initialState = (draft: ReadyDraft): EditorState => ({ content: contentOf(draft), raw: {}, open: null, removed: null, adding: false });

export type EditorAction =
  | { type: "title"; text: string }
  | { type: "summary"; text: string }
  | { type: "open"; id: string }
  | { type: "close" }
  /** A question changed in any way but its timer and its tolerance, which are typed (below). */
  | { type: "question"; question: DraftQuestion }
  | { type: "kind"; id: string; kind: QuestionKind }
  | { type: "timer"; id: string; text: string }
  | { type: "tolerance"; id: string; text: string }
  | { type: "move"; id: string; direction: "up" | "down" }
  | { type: "delete"; id: string }
  | { type: "restore" }
  | { type: "choosing"; on: boolean }
  /** `id` is made by the page (it must not repeat in the draft), so that this stays pure. */
  | { type: "add"; kind: QuestionKind; id: string };

/** A copy of the record without one key. */
function omit<T extends Record<string, unknown>>(record: T, key: string): T {
  const copy: Record<string, unknown> = { ...record };
  delete copy[key];
  return copy as T;
}

/** The typed text of one field forgotten, because it became a number; the question's record goes with its last field. */
const withoutRaw = (raw: RawText, id: string, field: "timer" | "tolerance"): RawText => {
  const mine = raw[id];
  if (!mine || mine[field] === undefined) return raw;
  const rest = omit(mine, field);
  return Object.keys(rest).length === 0 ? omit(raw, id) : { ...raw, [id]: rest };
};

const withRaw = (raw: RawText, id: string, field: "timer" | "tolerance", text: string): RawText => ({ ...raw, [id]: { ...raw[id], [field]: text } });

export function reduce(state: EditorState, action: EditorAction): EditorState {
  const { content } = state;
  const setQuestions = (questions: DraftQuestion[], extra: Partial<EditorState> = {}): EditorState => ({ ...state, ...extra, content: { ...content, questions } });
  switch (action.type) {
    case "title":
      return action.text === content.title ? state : { ...state, content: { ...content, title: action.text } };
    case "summary":
      return action.text === content.review_summary ? state : { ...state, content: { ...content, review_summary: action.text } };
    case "open":
      return state.open === action.id ? state : { ...state, open: action.id, adding: false };
    case "close":
      return state.open === null ? state : { ...state, open: null };
    case "question":
      return setQuestions(replaceQuestion(content.questions, action.question));
    case "kind": {
      const q = content.questions.find((x) => x.id === action.id);
      if (!q || q.kind === action.kind) return state;
      // The numbers typed for the old kind mean nothing to the new one.
      return setQuestions(replaceQuestion(content.questions, changeKind(q, action.kind)), { raw: omit(state.raw, action.id) });
    }
    case "timer": {
      const q = content.questions.find((x) => x.id === action.id);
      if (!q) return state;
      const n = parseWhole(action.text);
      // A number goes into the draft; what is not a number yet stays in the box and is a problem of the question until it is.
      if (n === null) return { ...state, raw: withRaw(state.raw, action.id, "timer", action.text) };
      const raw = withoutRaw(state.raw, action.id, "timer");
      return n === q.timer_seconds ? (raw === state.raw ? state : { ...state, raw }) : { ...setQuestions(replaceQuestion(content.questions, { ...q, timer_seconds: n })), raw };
    }
    case "tolerance": {
      const q = content.questions.find((x) => x.id === action.id);
      if (!q || q.kind !== "numeric") return state;
      const n = parseTolerance(action.text);
      if (n === null) return { ...state, raw: withRaw(state.raw, action.id, "tolerance", action.text) };
      const raw = withoutRaw(state.raw, action.id, "tolerance");
      return n === q.tolerance ? (raw === state.raw ? state : { ...state, raw }) : { ...setQuestions(replaceQuestion(content.questions, { ...q, tolerance: n })), raw };
    }
    case "move": {
      const questions = moveQuestion(content.questions, action.id, action.direction);
      const same = questions.every((q, i) => q.id === content.questions[i].id);
      // Only one deletion can be undone, and the list has changed since it was made.
      return same ? state : setQuestions(questions, { removed: null });
    }
    case "delete": {
      const out = removeQuestion(content.questions, action.id);
      if (!out) return state;
      return setQuestions(out.questions, { removed: out.removed, raw: omit(state.raw, action.id), open: state.open === action.id ? null : state.open });
    }
    case "restore": {
      if (!state.removed) return state;
      const questions = restoreQuestion(content.questions, state.removed);
      return setQuestions(questions, { removed: null, open: questions.length === content.questions.length ? state.open : state.removed.question.id });
    }
    case "choosing":
      return state.adding === action.on ? state : { ...state, adding: action.on };
    case "add": {
      const questions = addQuestion(content.questions, action.kind, action.id);
      return questions.length === content.questions.length ? state : setQuestions(questions, { open: action.id, removed: null, adding: false });
    }
  }
}

/** Whether there is a number typed that is not a number yet (so it is in no draft, and leaving would lose it). */
export const hasUnfinishedNumber = (raw: RawText): boolean => Object.values(raw).some((r) => r.timer !== undefined || r.tolerance !== undefined);

/**
 * What changed since `sent`, as the edit call takes it: only the parts that are not the same object any more. Nothing is
 * a change that was undone to the identical text, since the draft has it already.
 */
export function patchOf(sent: DraftContent, now: DraftContent): DraftPatch {
  const patch: DraftPatch = {};
  if (now.title !== sent.title) patch.title = now.title;
  if (now.review_summary !== sent.review_summary) patch.review_summary = now.review_summary;
  if (now.questions !== sent.questions && JSON.stringify(now.questions) !== JSON.stringify(sent.questions)) patch.questions = now.questions;
  return patch;
}

export const isEmptyPatch = (patch: DraftPatch): boolean => Object.keys(patch).length === 0;
