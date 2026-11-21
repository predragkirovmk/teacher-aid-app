import { translate, type Key } from "../../i18n";
import type { Locale, TeacherDocument } from "../types";
import { DOCS } from "./data";
import type { AppState } from "./store";

/**
 * The handouts the demo's teachers have sent, newest first (GET /me/documents). The title is the demo's own copy; the address is a
 * small file served with the app, standing in for the API's signed link. Which of them the teacher has sent and which the student
 * has opened is in the saved state, so a test can start with none or with one opened.
 */

const text = (locale: Locale, key: string) => translate(locale, key as Key);
const DAY = 86_400_000;

const SEED: Record<(typeof DOCS)[number], { teacher: string; daysAgo: number; type: TeacherDocument["type"]; sizeBytes: number }> = {
  d1: { teacher: "math", daysAgo: 1, type: "pdf", sizeBytes: 245_760 },
  d2: { teacher: "physics", daysAgo: 3, type: "pdf", sizeBytes: 1_572_864 },
  d3: { teacher: "mkd", daysAgo: 6, type: "doc", sizeBytes: 88_064 },
  d4: { teacher: "math", daysAgo: 9, type: "pdf", sizeBytes: 512_000 },
};

export function buildDocuments(state: AppState, locale: Locale, now = Date.now()): TeacherDocument[] {
  return DOCS.filter((id) => state.docs.includes(id)).map((id) => ({
    id,
    title: text(locale, `doc.${id}`),
    teacherName: text(locale, `teacher.${SEED[id].teacher}`),
    sentAt: now - SEED[id].daysAgo * DAY,
    type: SEED[id].type,
    sizeBytes: SEED[id].sizeBytes,
    url: "/app-demo/handout.pdf",
    opened: state.docsOpened.includes(id),
  }));
}
