// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Query } from "@/lib/app/api/hooks";
import { Gate } from "@/components/app/QueryState";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// The Gate marks <html> for the calm entrance in app.css only when its data landed after the screen had opened.
const query = (status: Query<string>["status"]): Query<string> => ({ status, data: status === "ready" ? "x" : undefined, error: null, refetch: () => {} }) as Query<string>;

describe("Gate entrance", () => {
  let host: HTMLElement;
  let root: Root;
  const html = document.documentElement;
  const show = (q: Query<string>) => act(() => root.render(<Gate query={q}>{(d) => <main className="screen">{d}</main>}</Gate>));

  beforeEach(() => {
    vi.useFakeTimers();
    host = document.body.appendChild(document.createElement("div"));
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    html.removeAttribute("data-arrive");
    vi.useRealTimers();
  });

  it("marks the page when data lands after loading, and takes the mark off after the entrance", async () => {
    await show(query("loading"));
    expect(html.hasAttribute("data-arrive")).toBe(false);
    await show(query("ready"));
    expect(html.hasAttribute("data-arrive")).toBe(true);
    act(() => vi.advanceTimersByTime(700));
    expect(html.hasAttribute("data-arrive")).toBe(false);
  });

  it("keeps the header element when the data lands, which is why app.css leaves the first child out of the entrance", async () => {
    const header = <header>Title</header>;
    const gate = (q: Query<string>) => (
      <Gate query={q} header={header}>
        {() => (
          <main className="screen">
            {header}
            <ul className="list" />
          </main>
        )}
      </Gate>
    );
    await act(() => root.render(gate(query("loading"))));
    const before = host.querySelector("header");
    await act(() => root.render(gate(query("ready"))));
    expect(host.querySelector("header")).toBe(before);
  });

  it("does not mark a screen that had its data when it opened", async () => {
    await show(query("ready"));
    expect(html.hasAttribute("data-arrive")).toBe(false);
  });

  it("keeps the mark while a second Gate that landed later is still rising, and clears it when the last one is done", async () => {
    const other = document.body.appendChild(document.createElement("div"));
    const second = createRoot(other);
    const gate = (q: Query<string>) => <Gate query={q}>{(d) => <main className="screen">{d}</main>}</Gate>;
    await show(query("loading"));
    await act(() => second.render(gate(query("loading"))));
    await show(query("ready"));
    act(() => vi.advanceTimersByTime(300));
    await act(() => second.render(gate(query("ready"))));
    act(() => vi.advanceTimersByTime(400)); // the first one's 700 ms is up
    expect(html.hasAttribute("data-arrive")).toBe(true);
    act(() => vi.advanceTimersByTime(300)); // the second one's is too
    expect(html.hasAttribute("data-arrive")).toBe(false);
    act(() => second.unmount());
    other.remove();
  });

  it("does not take the mark off when a screen that never set it unmounts", async () => {
    await show(query("loading"));
    await show(query("ready"));
    const other = document.body.appendChild(document.createElement("div"));
    const second = createRoot(other);
    await act(() => second.render(<Gate query={query("ready")}>{(d) => <main className="screen">{d}</main>}</Gate>));
    act(() => second.unmount());
    expect(html.hasAttribute("data-arrive")).toBe(true);
    other.remove();
  });

  it("takes the mark off when the screen is left before the entrance is over", async () => {
    await show(query("loading"));
    await show(query("ready"));
    act(() => root.unmount());
    expect(html.hasAttribute("data-arrive")).toBe(false);
    root = createRoot(host);
  });
});
