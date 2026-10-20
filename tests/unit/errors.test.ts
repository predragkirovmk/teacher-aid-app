import { describe, expect, it } from "vitest";
import {
  API_ERROR_CODES,
  ApiError,
  CLIENT_ERROR_CODES,
  SERVER_ERROR_CODES,
  isApiError,
  isApiErrorCode,
  parseErrorResponse,
  toApiError,
} from "@/lib/app/api/errors";

const reply = (status: number, body?: unknown, raw?: string) =>
  new Response(raw ?? (body === undefined ? null : JSON.stringify(body)), { status });

describe("error codes", () => {
  it("lists the six codes spec 11 names", () => {
    for (const code of ["token_expired", "not_enrolled", "session_ended", "already_answered", "limit_reached", "signed_in_elsewhere"]) {
      expect(SERVER_ERROR_CODES).toContain(code);
    }
  });

  it("keeps server and client codes apart and unique", () => {
    expect(new Set(API_ERROR_CODES).size).toBe(SERVER_ERROR_CODES.length + CLIENT_ERROR_CODES.length);
    expect(API_ERROR_CODES.length).toBe(SERVER_ERROR_CODES.length + CLIENT_ERROR_CODES.length);
  });

  it("recognises a code and nothing else", () => {
    expect(isApiErrorCode("token_expired")).toBe(true);
    expect(isApiErrorCode("network")).toBe(true);
    expect(isApiErrorCode("TOKEN_EXPIRED")).toBe(false);
    expect(isApiErrorCode(404)).toBe(false);
    expect(isApiErrorCode(undefined)).toBe(false);
  });
});

describe("ApiError", () => {
  it("carries the code, the status and falls back to the code as its message", () => {
    const e = new ApiError("rate_limited", { status: 429 });
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe("ApiError");
    expect(e.code).toBe("rate_limited");
    expect(e.status).toBe(429);
    expect(e.message).toBe("rate_limited");
  });

  it("has no status unless a response gave one", () => {
    expect(new ApiError("network").status).toBeNull();
  });

  it("toApiError keeps an ApiError and wraps anything else as unknown", () => {
    const e = new ApiError("not_found");
    expect(toApiError(e)).toBe(e);
    const wrapped = toApiError(new TypeError("boom"));
    expect(isApiError(wrapped)).toBe(true);
    expect(wrapped.code).toBe("unknown");
    expect(wrapped.message).toBe("boom");
    expect(wrapped.cause).toBeInstanceOf(TypeError);
    expect(toApiError("a string").code).toBe("unknown");
    expect(toApiError(null).code).toBe("unknown");
  });
});

describe("parseErrorResponse", () => {
  it("reads the proposed envelope", async () => {
    const e = await parseErrorResponse(reply(410, { error: { code: "token_expired", message: "gone" } }));
    expect(e.code).toBe("token_expired");
    expect(e.message).toBe("gone");
    expect(e.status).toBe(410);
  });

  it("reads a bare code too", async () => {
    const e = await parseErrorResponse(reply(403, { code: "not_enrolled" }));
    expect(e.code).toBe("not_enrolled");
    expect(e.status).toBe(403);
  });

  it("falls back to what the status implies when the server sends a code this build does not know", async () => {
    expect((await parseErrorResponse(reply(409, { error: { code: "brand_new_code" } }))).code).toBe("validation_failed");
    expect((await parseErrorResponse(reply(503, { error: { code: "brand_new_code" } }))).code).toBe("server_error");
  });

  it.each([
    [400, "validation_failed"],
    [401, "unauthenticated"],
    [404, "not_found"],
    [409, "validation_failed"],
    [422, "validation_failed"],
    [429, "rate_limited"],
    [500, "server_error"],
    [502, "server_error"],
    [418, "unknown"],
    [403, "unknown"],
  ])("maps a bare %i to %s", async (status, code) => {
    expect((await parseErrorResponse(reply(status))).code).toBe(code);
  });

  it("survives a body that is not JSON", async () => {
    const e = await parseErrorResponse(reply(502, undefined, "<html>Bad gateway</html>"));
    expect(e.code).toBe("server_error");
    expect(e.status).toBe(502);
  });

  it("survives odd shapes", async () => {
    expect((await parseErrorResponse(reply(404, "just a string"))).code).toBe("not_found");
    expect((await parseErrorResponse(reply(404, null, "null"))).code).toBe("not_found");
    expect((await parseErrorResponse(reply(404, { error: "oops" }))).code).toBe("not_found");
    expect((await parseErrorResponse(reply(404, { error: { code: 7 } }))).code).toBe("not_found");
  });

  it("ignores a message that is not text", async () => {
    const e = await parseErrorResponse(reply(404, { error: { code: "not_found", message: { nested: true } } }));
    expect(e.message).toBe("not_found");
  });
});
