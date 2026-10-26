import { describe, expect, it, vi } from "vitest";
import type { Notification } from "@/lib/app/api/types";

// feed.ts reloads its query through the query layer, which loads the adapter at build time; only the paging is under test.
const reload = vi.fn(async () => null as unknown);
vi.mock("@/lib/app/api/query", () => ({ reload }));

const { feedPages, loadFeed, loadMoreFeed, resetFeed } = await import("@/lib/app/feed");

const note = (n: number): Notification => ({ id: `n${n}`, kind: "generic", payload: {}, createdAt: 1000 - n, readAt: null });
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => note(from + i));

/** A server holding `total` notifications, newest first, that pages by a cursor. */
function server(total: number) {
  const all = range(1, total);
  const calls: { limit?: number; before?: string }[] = [];
  return {
    calls,
    client: {
      listNotifications: vi.fn(async (page: { limit?: number; before?: string } = {}) => {
        calls.push(page);
        const from = page.before ? all.findIndex((n) => n.id === page.before) + 1 : 0;
        return all.slice(from, from + (page.limit ?? 30));
      }),
    },
  };
}

describe("reading the feed a page at a time", () => {
  it("reads one page for one page, handing back the client's own promise", () => {
    const s = server(5);
    const p = loadFeed(s.client as never, 1, 3);
    expect(s.calls).toEqual([{ limit: 3 }]);
    return expect(p).resolves.toHaveLength(3);
  });

  it("reads as many pages as were asked for, each from the cursor the one before ended on", async () => {
    const s = server(10);
    const all = await loadFeed(s.client as never, 3, 3);
    expect(all.map((n) => n.id)).toEqual(range(1, 9).map((n) => n.id));
    expect(s.calls).toEqual([{ limit: 3 }, { limit: 3, before: "n3" }, { limit: 3, before: "n6" }]);
  });

  it("stops at the last page, which is shorter than the others, however many were asked for", async () => {
    const s = server(7);
    const all = await loadFeed(s.client as never, 5, 3);
    expect(all).toHaveLength(7);
    expect(s.calls).toHaveLength(3);
  });

  it("does not list a notification twice when one arrived between two pages", async () => {
    const first = range(1, 3);
    const second = [note(3), note(4), note(5)]; // n3 slid down a place
    const list = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    const all = await loadFeed({ listNotifications: list } as never, 2, 3);
    expect(all.map((n) => n.id)).toEqual(["n1", "n2", "n3", "n4", "n5"]);
  });
});

describe("asking for older alerts", () => {
  it("does nothing until a full page has said there may be more", async () => {
    resetFeed();
    await loadFeed(server(2).client as never, 1, 3);
    expect(await loadMoreFeed()).toBeNull();
    expect(feedPages()).toBe(1);
    expect(reload).not.toHaveBeenCalled();
  });

  it("asks for the next page, and takes it back when that fails", async () => {
    resetFeed();
    await loadFeed(server(10).client as never, 1, 3);
    await vi.waitFor(() => expect(reload).not.toHaveBeenCalled());
    const ok = await loadMoreFeed();
    expect(ok).toBeNull();
    expect(feedPages()).toBe(2);
    expect(reload).toHaveBeenCalledWith("notifications");

    const failure = new Error("offline");
    reload.mockResolvedValueOnce(failure);
    expect(await loadMoreFeed()).toBe(failure);
    expect(feedPages()).toBe(2);
  });

  it("goes back to the newest page for the next student", async () => {
    await loadMoreFeed();
    resetFeed();
    expect(feedPages()).toBe(1);
  });
});
