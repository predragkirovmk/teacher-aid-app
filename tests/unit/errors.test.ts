import { describe, expect, test } from "vitest";
import { ApiError, codeForStatus, isApiError, parseErrorResponse, toApiError } from "@/lib/teacher/api/errors";

const response = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers });

describe("reading an error response (spec 11)", () => {
  test("takes the code from the envelope", async () => {
    const error = await parseErrorResponse(response(410, { error: { code: "session_ended", message: "The lesson has ended" } }));
    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe("session_ended");
    expect(error.status).toBe(410);
    expect(error.message).toBe("The lesson has ended");
  });

  test("reads a bare code too", async () => {
    expect((await parseErrorResponse(response(409, { code: "limit_reached" }))).code).toBe("limit_reached");
  });

  test("a code it does not know falls back to the one the status implies", async () => {
    expect((await parseErrorResponse(response(404, { error: { code: "no_such_thing" } }))).code).toBe("not_found");
    expect((await parseErrorResponse(response(503, { error: { code: "overloaded" } }))).code).toBe("server_error");
    expect((await parseErrorResponse(response(422, { error: { code: "bad_shape" } }))).code).toBe("validation_failed");
  });

  test("a body that is not JSON leaves the status to decide", async () => {
    expect((await parseErrorResponse(response(401, "<html>nope</html>"))).code).toBe("unauthenticated");
    expect((await parseErrorResponse(response(500, ""))).code).toBe("server_error");
  });

  test("reads Retry-After in seconds, and only that form", async () => {
    expect((await parseErrorResponse(response(429, { error: { code: "rate_limited" } }, { "Retry-After": "42" }))).retryAfter).toBe(42);
    expect((await parseErrorResponse(response(429, { error: { code: "rate_limited" } }, { "Retry-After": "Wed, 21 Oct 2026 07:28:00 GMT" }))).retryAfter).toBeNull();
    expect((await parseErrorResponse(response(429, { error: { code: "rate_limited" } }))).retryAfter).toBeNull();
  });

  test("reads why a validation failed, when the server says", async () => {
    const error = await parseErrorResponse(response(422, { error: { code: "validation_failed", reason: "no_text" } }));
    expect(error.reason).toBe("no_text");
    expect((await parseErrorResponse(response(422, { error: { code: "validation_failed", reason: "something else" } }))).reason).toBeNull();
  });

  test("the teacher codes of this app come through", async () => {
    for (const code of ["generation_failed", "session_open", "invalid_state", "question_open"] as const) {
      expect((await parseErrorResponse(response(409, { error: { code } }))).code).toBe(code);
    }
  });
});

describe("statuses and plain errors", () => {
  test("a status stands for a code", () => {
    expect(codeForStatus(401)).toBe("unauthenticated");
    expect(codeForStatus(404)).toBe("not_found");
    expect(codeForStatus(400)).toBe("validation_failed");
    expect(codeForStatus(429)).toBe("rate_limited");
    expect(codeForStatus(500)).toBe("server_error");
    expect(codeForStatus(418)).toBe("unknown");
  });

  test("anything thrown becomes an ApiError a screen can read", () => {
    const wrapped = toApiError(new TypeError("fetch failed"));
    expect(isApiError(wrapped)).toBe(true);
    expect(wrapped.code).toBe("unknown");
    expect(wrapped.message).toBe("fetch failed");
    const same = new ApiError("network");
    expect(toApiError(same)).toBe(same);
  });
});
