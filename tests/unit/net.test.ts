// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FLASH_MS, RECONNECT_SHOW_MS, badOf, createNetStore } from "@/lib/app/session/net";

describe("what is wrong", () => {
  const ok = { online: true, link: "open", syncing: false, failing: false } as const;
  it("says offline whenever the phone says so", () => {
    expect(badOf({ ...ok, online: false })).toBe("offline");
    expect(badOf({ ...ok, online: false, link: "reconnecting" })).toBe("offline");
  });
  it("says reconnecting when the phone thinks it is online but the lesson or the server is not answering", () => {
    expect(badOf({ ...ok, link: "reconnecting" })).toBe("reconnecting");
    expect(badOf({ ...ok, syncing: true })).toBe("reconnecting");
    expect(badOf({ ...ok, failing: true })).toBe("reconnecting");
  });
  it("says nothing while all is well, outside a lesson, and while the first link is being made", () => {
    expect(badOf(ok)).toBeNull();
    expect(badOf({ ...ok, link: null })).toBeNull();
    expect(badOf({ ...ok, link: "connecting" })).toBeNull();
  });
});

describe("the connection note", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_800_000_000_000);
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
  });
  afterEach(() => vi.useRealTimers());

  const phone = (online: boolean) => {
    Object.defineProperty(navigator, "onLine", { value: online, configurable: true });
    window.dispatchEvent(new Event(online ? "online" : "offline"));
  };
  const watch = () => {
    const store = createNetStore();
    const stop = store.subscribe(() => {});
    return { store, stop };
  };

  it("starts quiet", () => {
    const { store } = watch();
    expect(store.getView()).toEqual({ banner: null, pending: 0, sent: false });
  });

  it("goes offline at once, and says back online for a moment when it returns", () => {
    const { store } = watch();
    phone(false);
    expect(store.getView().banner).toBe("offline");
    phone(true);
    expect(store.getView().banner).toBe("back");
    vi.advanceTimersByTime(FLASH_MS + 10);
    expect(store.getView().banner).toBeNull();
  });

  it("does not flash reconnecting for a blip: it is said only once it has lasted a moment", () => {
    const { store } = watch();
    store.setLink("reconnecting");
    expect(store.getView().banner).toBeNull();
    store.setLink("open");
    vi.advanceTimersByTime(RECONNECT_SHOW_MS * 2);
    // It never showed, so there is no "back" either.
    expect(store.getView().banner).toBeNull();

    store.setLink("reconnecting");
    vi.advanceTimersByTime(RECONNECT_SHOW_MS + 10);
    expect(store.getView().banner).toBe("reconnecting");
    store.setLink("open");
    expect(store.getView().banner).toBe("back");
  });

  it("goes from offline to reconnecting to back without a gap", () => {
    const { store } = watch();
    store.setLink("reconnecting");
    phone(false);
    expect(store.getView().banner).toBe("offline");
    phone(true);
    // The phone has signal; the lesson's link is still being remade.
    expect(store.getView().banner).toBe("reconnecting");
    store.setLink("open");
    expect(store.getView().banner).toBe("back");
  });

  it("counts the answers that are saved, and says they were sent when the outbox empties", () => {
    const { store } = watch();
    phone(false);
    store.setOutbox({ pending: 2, failing: true });
    expect(store.getView()).toMatchObject({ banner: "offline", pending: 2, sent: false });
    phone(true);
    store.setOutbox({ pending: 0, failing: false });
    expect(store.getView()).toMatchObject({ pending: 0, sent: true });
    vi.advanceTimersByTime(FLASH_MS + 10);
    expect(store.getView().sent).toBe(false);
  });

  it("a failing outbox with the phone online is reconnecting, after the moment", () => {
    const { store } = watch();
    store.setOutbox({ pending: 1, failing: true });
    expect(store.getView().banner).toBeNull();
    vi.advanceTimersByTime(RECONNECT_SHOW_MS + 10);
    expect(store.getView()).toMatchObject({ banner: "reconnecting", pending: 1 });
  });

  it("a pretend outage reads as offline, and wakes the page with the events a real one would send", () => {
    const { store } = watch();
    const heard: string[] = [];
    window.addEventListener("offline", () => heard.push("offline"));
    window.addEventListener("online", () => heard.push("online"));
    store.setForcedOffline(true);
    expect(store.isOffline()).toBe(true);
    expect(store.getView().banner).toBe("offline");
    store.setForcedOffline(false);
    expect(store.isOffline()).toBe(false);
    expect(store.getView().banner).toBe("back");
    expect(heard).toEqual(["offline", "online"]);
  });

  it("a pretend outage's events do not make a phone that really is offline look online", () => {
    const { store } = watch();
    phone(false);
    store.setForcedOffline(true);
    store.setForcedOffline(false);
    expect(store.getView().banner).toBe("offline");
    expect(store.isOffline()).toBe(true);
  });

  it("tells whoever listens only when what is shown changes", () => {
    const { store } = watch();
    const heard = vi.fn();
    store.subscribe(heard);
    store.setLink("open");
    store.setLink("open");
    expect(heard).not.toHaveBeenCalled();
    phone(false);
    expect(heard).toHaveBeenCalledTimes(1);
  });
});
