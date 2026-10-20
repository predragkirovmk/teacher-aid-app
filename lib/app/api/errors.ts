/**
 * Stable machine codes for API errors. The first six are the ones spec section 11 names; the rest
 * are PROPOSED server codes, then codes the client raises itself (never on the wire). The client
 * maps each code to Macedonian and English copy (`err.<code>` in i18n.ts).
 */
export const SERVER_ERROR_CODES = [
  // Spec 11.
  "token_expired",
  "not_enrolled",
  "session_ended",
  "already_answered",
  "limit_reached",
  "signed_in_elsewhere",
  // PROPOSED.
  "unauthenticated",
  "unknown_email",
  "not_found",
  "validation_failed",
  "question_closed",
  "rate_limited",
  "server_error",
] as const;

export const CLIENT_ERROR_CODES = ["network", "invalid_response", "not_implemented", "unknown"] as const;

export type ServerErrorCode = (typeof SERVER_ERROR_CODES)[number];
export type ClientErrorCode = (typeof CLIENT_ERROR_CODES)[number];
export type ApiErrorCode = ServerErrorCode | ClientErrorCode;

export const API_ERROR_CODES: readonly ApiErrorCode[] = [...SERVER_ERROR_CODES, ...CLIENT_ERROR_CODES];

export const isApiErrorCode = (v: unknown): v is ApiErrorCode => API_ERROR_CODES.includes(v as ApiErrorCode);

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  /** The HTTP status, when the error came from a response. */
  readonly status: number | null;

  constructor(code: ApiErrorCode, options: { status?: number | null; message?: string; cause?: unknown } = {}) {
    super(options.message ?? code, { cause: options.cause });
    this.name = "ApiError";
    this.code = code;
    this.status = options.status ?? null;
  }
}

export const isApiError = (e: unknown): e is ApiError => e instanceof ApiError;

/** Whatever was thrown, as an ApiError, so a screen only ever has to read `.code`. */
export function toApiError(e: unknown): ApiError {
  if (isApiError(e)) return e;
  return new ApiError("unknown", { cause: e, message: e instanceof Error ? e.message : undefined });
}

/** The status an error response carries when its body names no code. */
function codeForStatus(status: number): ApiErrorCode {
  if (status === 401) return "unauthenticated";
  if (status === 404) return "not_found";
  if (status === 409 || status === 422 || status === 400) return "validation_failed";
  if (status === 429) return "rate_limited";
  return status >= 500 ? "server_error" : "unknown";
}

/**
 * Read an error response. The envelope is `{ "error": { "code": "token_expired", "message": "..." } }`
 * (PROPOSED); a bare `{ "code": ... }` is read too. A code the client does not know falls back to
 * the one the HTTP status implies, so new server codes never break a screen.
 */
export async function parseErrorResponse(res: Response): Promise<ApiError> {
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // an empty or non-JSON body: the status is all there is
  }
  const root = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const inner = root.error && typeof root.error === "object" ? (root.error as Record<string, unknown>) : root;
  const code = isApiErrorCode(inner.code) ? inner.code : codeForStatus(res.status);
  const message = typeof inner.message === "string" ? inner.message : undefined;
  return new ApiError(code, { status: res.status, message });
}
