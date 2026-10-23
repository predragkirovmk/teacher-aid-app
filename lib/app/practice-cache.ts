import type { ApiClient } from "./api/client";
import { toApiError } from "./api/errors";
import type { PracticeSet } from "./api/types";

/**
 * The practice sets as the phone last saw them, kept so a student who opens the app without a signal can still open a set and answer it
 * (the answers wait in the outbox, F-12). Only the questions, the student's progress and the server's verdicts are in it: nothing the server
 * had not already shown this student. It goes when the student signs out.
 */
export const PRACTICE_CACHE_KEY = "teacheraid-practice-cache";

export function rememberSets(sets: PracticeSet[]) {
  try {
    window.localStorage.setItem(PRACTICE_CACHE_KEY, JSON.stringify(sets));
  } catch {
    // blocked or full: the sets are only unavailable offline
  }
}

export function recallSets(): PracticeSet[] | null {
  try {
    const raw = window.localStorage.getItem(PRACTICE_CACHE_KEY);
    const sets: unknown = raw ? JSON.parse(raw) : null;
    return Array.isArray(sets) ? (sets as PracticeSet[]) : null;
  } catch {
    return null;
  }
}

export function forgetSets() {
  try {
    window.localStorage.removeItem(PRACTICE_CACHE_KEY);
  } catch {
    // nothing was kept
  }
}

/** The sets from the API, remembered; or, with no connection, the ones remembered. */
export async function loadSets(c: ApiClient): Promise<PracticeSet[]> {
  try {
    const sets = await c.listPracticeSets();
    rememberSets(sets);
    return sets;
  } catch (e) {
    const cached = toApiError(e).code === "network" ? recallSets() : null;
    if (cached) return cached;
    throw e;
  }
}
