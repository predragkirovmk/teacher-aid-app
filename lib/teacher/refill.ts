import { isFormMemory, isRefill, type FormMemory, type Refill } from "./prepare";

/**
 * Where the form keeps what a cancelled wait gives back: the tab's session storage, which a reload of the draft page keeps and a new
 * tab does not (the draft then gives back what the server knows). Never throws; a browser that refuses (private mode) just gives
 * the teacher an emptier form.
 */

const MEMORY = "teacheraid-teacher-form-memory-v1";
const REFILL = "teacheraid-teacher-form-refill-v1";

const store = (): Storage | null => {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
};

function read<T>(key: string, ok: (v: unknown) => v is T): T | null {
  try {
    const raw = store()?.getItem(key);
    const value: unknown = raw ? JSON.parse(raw) : null;
    return ok(value) ? value : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    if (value === null) store()?.removeItem(key);
    else store()?.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}

/** Keep what the form held, for the draft that came of it. */
export const rememberForm = (memory: FormMemory) => write(MEMORY, memory);
export const recallForm = (): FormMemory | null => read(MEMORY, isFormMemory);

/** Leave the form to come back to for the page that is about to open. */
export const leaveRefill = (refill: Refill) => write(REFILL, refill);
export const readRefill = (): Refill | null => read(REFILL, isRefill);
export const clearRefill = () => write(REFILL, null);
