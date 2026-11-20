import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "../../app/(app)/app/api/client-error/route";

const good = { message: "boom", stack: "Error: boom\n  at x", path: "/app/play/MATH-7B", app: "app", userAgent: "UA" };
const post = (body: string) => POST(new Request("http://localhost/app/api/client-error", { method: "POST", body, headers: { "content-type": "application/json" } }));

afterEach(() => vi.restoreAllMocks());

describe("client error route", () => {
  it("logs a good report and answers 204", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await post(JSON.stringify(good));
    expect(res.status).toBe(204);
    expect(log).toHaveBeenCalledWith("[client-error]", JSON.stringify(good));
  });

  it("refuses a body over 4 KB with 413", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await post(JSON.stringify({ ...good, stack: "x".repeat(5000) }))).status).toBe(413);
    expect(log).not.toHaveBeenCalled();
  });

  it("refuses bad JSON or wrong types with 400", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await post("not json")).status).toBe(400);
    expect((await post(JSON.stringify({ ...good, app: "site" }))).status).toBe(400);
    expect((await post(JSON.stringify({ ...good, message: 5 }))).status).toBe(400);
    expect(log).not.toHaveBeenCalled();
  });

  it("logs only the allowed fields", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await post(JSON.stringify({ ...good, name: "Ana", token: "secret" }));
    expect(log).toHaveBeenCalledWith("[client-error]", JSON.stringify(good));
  });
});
