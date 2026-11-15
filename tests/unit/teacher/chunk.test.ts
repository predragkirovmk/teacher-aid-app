import { describe, expect, it } from "vitest";
import { isChunkLoadError, reloadOnce } from "../../../lib/teacher/chunk";

const memory = () => {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
};

describe("a page whose code could not be fetched", () => {
  it("is told apart from any other error", () => {
    const chunk = new Error("Failed to load chunk /_next/static/chunks/0k93h7sg-di-g.js from module 13015");
    chunk.name = "ChunkLoadError";
    expect(isChunkLoadError(chunk)).toBe(true);
    expect(isChunkLoadError(new Error("Failed to load chunk /_next/static/chunks/a.js"))).toBe(true);
    expect(isChunkLoadError(new TypeError("Failed to fetch dynamically imported module: /x.js"))).toBe(true);
    expect(isChunkLoadError(new Error("Cannot read properties of undefined"))).toBe(false);
    expect(isChunkLoadError("Failed to load chunk")).toBe(false);
  });

  it("reloads the page once, and not again for the same address in a short while", () => {
    const store = memory();
    let reloads = 0;
    const reload = () => void reloads++;
    expect(reloadOnce("/teacher", reload, 1_000, store)).toBe(true);
    expect(reloadOnce("/teacher", reload, 5_000, store)).toBe(false);
    expect(reloads).toBe(1);
    // Another page, or the same one much later, may reload again.
    expect(reloadOnce("/teacher/lessons", reload, 6_000, store)).toBe(true);
    expect(reloadOnce("/teacher", reload, 60_000, store)).toBe(true);
    expect(reloads).toBe(3);
  });

  it("does not reload by itself where nothing can be kept to stop a loop", () => {
    const broken = { getItem: () => { throw new Error("blocked"); }, setItem: () => undefined };
    let reloads = 0;
    expect(reloadOnce("/teacher", () => void reloads++, 1_000, broken)).toBe(false);
    expect(reloads).toBe(0);
  });
});
