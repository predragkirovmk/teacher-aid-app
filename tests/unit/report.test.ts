import { afterEach, describe, expect, it, vi } from "vitest";
import { reportError, reportingOn, setReportSink } from "@/lib/app/report";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  setReportSink(null);
});

describe("reportError", () => {
  it("does nothing without a DSN", () => {
    const sink = vi.fn();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    setReportSink(sink);
    expect(reportingOn()).toBe(false);
    reportError(new Error("boom"), { where: "query", code: "server_error" });
    expect(sink).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });

  it.each(["NEXT_PUBLIC_SENTRY_DSN", "NEXT_PUBLIC_ERROR_REPORT_DSN"])("is switched on by %s", (name) => {
    vi.stubEnv(name, "https://key@example.invalid/1");
    expect(reportingOn()).toBe(true);
  });

  it("hands the error and its context to the sink when a DSN is set", () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "https://key@example.invalid/1");
    const sink = vi.fn();
    setReportSink(sink);
    const error = new Error("boom");
    reportError(error, { where: "app-error", digest: "abc" });
    expect(sink).toHaveBeenCalledWith(error, { where: "app-error", digest: "abc" });
  });

  it("writes to the console until a sink is registered", () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "https://key@example.invalid/1");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    reportError(new Error("boom"), { where: "query" });
    expect(log).toHaveBeenCalledOnce();
  });

  it("never throws, even if the sink does", () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "https://key@example.invalid/1");
    setReportSink(() => {
      throw new Error("sink down");
    });
    expect(() => reportError(new Error("boom"), { where: "query" })).not.toThrow();
  });
});
