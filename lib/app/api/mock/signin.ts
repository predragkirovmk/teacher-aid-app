import { ApiError } from "../errors";
import type { SignInChallenge } from "../types";
import { emailError, normalizeEmail } from "../../signin";
import { MOCK_CODE, MOCK_ROSTER } from "./roster";

/**
 * The mock's sign-in: the rules the API will enforce, played in the browser. The roster is a short
 * list of emails (data.ts), the "emailed" code is a fixed one the welcome screen shows as a hint,
 * and the code expires, may be tried a few times and then locks, as a real one will. Numbers are the
 * PROPOSED ones of the handoff spec; they are constants here so a test can reach them.
 *
 * The pending code is kept in sessionStorage, so a reload (or the student switching to a mail app and
 * back, which can discard the page) does not lose it, and a closed tab forgets it.
 */

export const CODE_LENGTH = MOCK_CODE.length;
export const CODE_TTL_MS = 10 * 60_000;
export const RESEND_AFTER_MS = 30_000;
/** Wrong codes allowed before the sign-in locks. */
export const MAX_WRONG_CODES = 5;
export const LOCK_SECONDS = 60;

const KEY = "teacheraid-mock-challenge";

type Pending = { email: string; expiresAt: number; wrong: number; lockedUntil: number };

const read = (): Pending | null => {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Pending) : null;
  } catch {
    return memory;
  }
};

/** Where the pending code lives when sessionStorage is blocked. */
let memory: Pending | null = null;

const write = (pending: Pending | null) => {
  memory = pending;
  try {
    if (pending) window.sessionStorage.setItem(KEY, JSON.stringify(pending));
    else window.sessionStorage.removeItem(KEY);
  } catch {
    // blocked storage: the copy in memory serves
  }
};

/** Signing in needs the server, so a phone that is offline cannot, in the mock as for real. */
const needNetwork = () => {
  if (typeof navigator !== "undefined" && navigator.onLine === false) throw new ApiError("network");
};

export function startMockSignIn(rawEmail: string): SignInChallenge {
  needNetwork();
  const email = normalizeEmail(rawEmail);
  if (emailError(email)) throw new ApiError("validation_failed");
  if (!MOCK_ROSTER.includes(email)) throw new ApiError("unknown_email");
  const now = Date.now();
  write({ email, expiresAt: now + CODE_TTL_MS, wrong: 0, lockedUntil: 0 });
  return { method: "code", codeLength: CODE_LENGTH, expiresAt: now + CODE_TTL_MS, resendAt: now + RESEND_AFTER_MS };
}

/** Check a code. Returns normally when it is right (and spends it); throws the API's refusal otherwise. */
export function verifyMockCode(rawEmail: string, rawCode: string): void {
  needNetwork();
  const email = normalizeEmail(rawEmail);
  const now = Date.now();
  const pending = read();
  if (!pending || pending.email !== email || now > pending.expiresAt) {
    write(null);
    throw new ApiError("code_expired");
  }
  if (now < pending.lockedUntil) {
    throw new ApiError("rate_limited", { retryAfter: Math.ceil((pending.lockedUntil - now) / 1000) });
  }
  if (rawCode.replace(/\s/g, "") !== MOCK_CODE) {
    const wrong = pending.wrong + 1;
    if (wrong >= MAX_WRONG_CODES) {
      write({ ...pending, wrong: 0, lockedUntil: now + LOCK_SECONDS * 1000 });
      throw new ApiError("rate_limited", { retryAfter: LOCK_SECONDS });
    }
    write({ ...pending, wrong });
    throw new ApiError("invalid_code");
  }
  write(null);
}
