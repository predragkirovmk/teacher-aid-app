/**
 * Stable machine codes for API errors. The first group is what spec section 11 names, the second
 * is PROPOSED for the teacher side, and the last is raised by the client itself and never travels
 * on the wire. Every code has plain Macedonian and English copy in i18n.ts (`err.<code>`), and the
 * copy table is typed over this list, so a new code does not build until it has words.
 */
export const SERVER_ERROR_CODES = [
  // Spec 11.
  "token_expired",
  "not_enrolled",
  "session_ended",
  "already_answered",
  "limit_reached",
  "signed_in_elsewhere",
  "unauthenticated",
  "unknown_email",
  "sign_in_failed",
  "not_found",
  "validation_failed",
  "question_closed",
  "rate_limited",
  "server_error",
  // PROPOSED, teacher side.
  /** The AI could not make a usable lesson, after the one retry (EC-LES-02). */
  "generation_failed",
  /** A second session for a course that already has one open (EC-SES-02). */
  "session_open",
  /** A move the session's state does not allow: backwards, or an action after End (4.1). */
  "invalid_state",
  /** A second question while one is open (4.2). */
  "question_open",
] as const;

export const CLIENT_ERROR_CODES = ["network", "invalid_response", "not_implemented", "unknown"] as const;

export type ServerErrorCode = (typeof SERVER_ERROR_CODES)[number];
export type ClientErrorCode = (typeof CLIENT_ERROR_CODES)[number];
export type ApiErrorCode = ServerErrorCode | ClientErrorCode;

export const API_ERROR_CODES: readonly ApiErrorCode[] = [...SERVER_ERROR_CODES, ...CLIENT_ERROR_CODES];

export const isApiErrorCode = (v: unknown): v is ApiErrorCode => API_ERROR_CODES.includes(v as ApiErrorCode);

/**
 * Why a `validation_failed` was refused, when the teacher can fix it. PROPOSED: the envelope of 11 has
 * only a code and a message, and an upload that fails (EC-LES-06, BR-LES-05) needs to say which of
 * four things was wrong.
 */
export const VALIDATION_REASONS = ["file_type", "file_too_large", "empty", "no_text", "text_too_short"] as const;
export type ValidationReason = (typeof VALIDATION_REASONS)[number];

const isReason = (v: unknown): v is ValidationReason => VALIDATION_REASONS.includes(v as ValidationReason);

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  /** The HTTP status, when the error came from a response. */
  readonly status: number | null;
  /** Seconds the server asked the client to wait (`Retry-After`), when it did. */
  readonly retryAfter: number | null;
  /** For `validation_failed`, what was wrong, when the server says. */
  readonly reason: ValidationReason | null;

  constructor(
    code: ApiErrorCode,
    options: {
      status?: number | null;
      message?: string;
      cause?: unknown;
      retryAfter?: number | null;
      reason?: ValidationReason | null;
    } = {},
  ) {
    super(options.message ?? code, { cause: options.cause });
    this.name = "ApiError";
    this.code = code;
    this.status = options.status ?? null;
    this.retryAfter = options.retryAfter ?? null;
    this.reason = options.reason ?? null;
  }
}

export const isApiError = (e: unknown): e is ApiError => e instanceof ApiError;

/** Whatever was thrown, as an ApiError, so a screen only ever has to read `.code`. */
export function toApiError(e: unknown): ApiError {
  if (isApiError(e)) return e;
  return new ApiError("unknown", { cause: e, message: e instanceof Error ? e.message : undefined });
}

/** The code an error response with this status and no usable body stands for. */
export function codeForStatus(status: number): ApiErrorCode {
  if (status === 401) return "unauthenticated";
  if (status === 404) return "not_found";
  if (status === 400 || status === 409 || status === 422) return "validation_failed";
  if (status === 429) return "rate_limited";
  return status >= 500 ? "server_error" : "unknown";
}

/**
 * Read an error response. The envelope is `{ "error": { "code": "token_expired", "message": "..." } }` (spec 11,
 * PROPOSED); a bare `{ "code": ... }` is read too, and so is a `Retry-After` header in seconds. A code this client does
 * not know falls back to the one the HTTP status implies, so a new server code never breaks a screen.
 */
export async function parseErrorResponse(res: Response): Promise<ApiError> {
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // An empty or non-JSON body: the status is all there is.
  }
  const root = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const inner = root.error && typeof root.error === "object" ? (root.error as Record<string, unknown>) : root;
  const code = isApiErrorCode(inner.code) ? inner.code : codeForStatus(res.status);
  const message = typeof inner.message === "string" ? inner.message : undefined;
  const reason = isReason(inner.reason) ? inner.reason : null;
  // Only the delay-in-seconds form of Retry-After; an HTTP date is not worth a clock calculation here.
  const wait = Number(res.headers.get("Retry-After"));
  const retryAfter = Number.isFinite(wait) && wait > 0 ? Math.ceil(wait) : null;
  return new ApiError(code, { status: res.status, message, retryAfter, reason });
}
