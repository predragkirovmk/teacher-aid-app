import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BACKOFF,
  ChannelTransport,
  SILENCE_MS,
  STABLE_MS,
  backoffDelay,
  type ConnectionState,
  type LinkHandlers,
  type RealtimeMessage,
} from "@/lib/app/session/transport";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("the backoff", () => {
  it("doubles from a second to a ceiling, with no jitter at the middle of the random range", () => {
    const mid = () => 0.5;
    expect([0, 1, 2, 3, 4, 5, 9].map((n) => backoffDelay(n, mid))).toEqual([1000, 2000, 4000, 8000, 15_000, 15_000, 15_000]);
  });

  it("stays within a quarter either side", () => {
    expect(backoffDelay(2, () => 0)).toBe(Math.round(4000 * (1 - BACKOFF.jitter)));
    expect(backoffDelay(2, () => 1)).toBe(Math.round(4000 * (1 + BACKOFF.jitter)));
  });

  it("treats a negative attempt as the first", () => {
    expect(backoffDelay(-3, () => 0.5)).toBe(1000);
  });
});

/** A provider that records the links it is asked to make, so a test can play the server. */
function setup(options = {}) {
  const links: { channels: string[]; handlers: LinkHandlers; closed: boolean }[] = [];
  const transport = new ChannelTransport(
    (channels, handlers) => {
      const link = { channels, handlers, closed: false };
      links.push(link);
      return { close: () => void (link.closed = true) };
    },
    { random: () => 0.5, ...options },
  );
  const states: ConnectionState[] = [];
  transport.onState((s) => states.push(s));
  const last = () => links[links.length - 1];
  return { transport, links, states, last };
}

const msg = (channel: string, type = "x"): RealtimeMessage => ({ channel, type, data: {} });

describe("the transport", () => {
  it("makes one link for the channels subscribed in the same tick", async () => {
    const { transport, links } = setup();
    transport.subscribe("student.1", () => {});
    transport.subscribe("session.9.public", () => {});
    expect(links).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(0);
    expect(links).toHaveLength(1);
    expect(links[0].channels).toEqual(["session.9.public", "student.1"]);
    expect(transport.state).toBe("connecting");
  });

  it("is open when the link says so, and hands each message to its channel only", async () => {
    const { transport, last, states } = setup();
    const a = vi.fn();
    const b = vi.fn();
    transport.subscribe("a", a);
    transport.subscribe("b", b);
    await vi.advanceTimersByTimeAsync(0);
    last().handlers.open();
    last().handlers.message(msg("a", "one"));
    last().handlers.message(msg("b", "two"));
    last().handlers.message(msg("nobody"));
    expect(states).toEqual(["open"]);
    expect(a).toHaveBeenCalledOnce();
    expect(a.mock.calls[0][0].type).toBe("one");
    expect(b).toHaveBeenCalledOnce();
  });

  it("can have its link open before the connect call returns", async () => {
    const t = new ChannelTransport((_, handlers) => {
      handlers.open();
      return { close() {} };
    });
    t.subscribe("a", () => {});
    await vi.advanceTimersByTimeAsync(0);
    expect(t.state).toBe("open");
  });

  it("stops handing a channel's messages to a handler that unsubscribed", async () => {
    const { transport, last } = setup();
    const h = vi.fn();
    const stop = transport.subscribe("a", h);
    transport.subscribe("a", () => {});
    await vi.advanceTimersByTimeAsync(0);
    last().handlers.open();
    stop();
    last().handlers.message(msg("a"));
    expect(h).not.toHaveBeenCalled();
  });

  describe("when the link drops", () => {
    it("reconnects after one second, then two, then four", async () => {
      const { transport, links, states } = setup();
      transport.subscribe("a", () => {});
      await vi.advanceTimersByTimeAsync(0);
      links[0].handlers.open();
      links[0].handlers.closed();
      expect(states).toEqual(["open", "reconnecting"]);
      expect(links[0].closed).toBe(true);

      await vi.advanceTimersByTimeAsync(999);
      expect(links).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(links).toHaveLength(2);

      // It fails again before opening: the wait doubles.
      links[1].handlers.closed();
      await vi.advanceTimersByTimeAsync(1999);
      expect(links).toHaveLength(2);
      await vi.advanceTimersByTimeAsync(1);
      expect(links).toHaveLength(3);

      links[2].handlers.closed();
      await vi.advanceTimersByTimeAsync(4000);
      expect(links).toHaveLength(4);
    });

    it("comes back to open, and the subscriptions come with it", async () => {
      const { transport, links, states } = setup();
      const h = vi.fn();
      transport.subscribe("a", h);
      await vi.advanceTimersByTimeAsync(0);
      links[0].handlers.open();
      links[0].handlers.closed();
      await vi.advanceTimersByTimeAsync(1000);
      links[1].handlers.open();
      links[1].handlers.message(msg("a"));
      expect(states).toEqual(["open", "reconnecting", "open"]);
      expect(links[1].channels).toEqual(["a"]);
      expect(h).toHaveBeenCalledOnce();
    });

    it("starts the backoff over once a link has stayed up", async () => {
      const { transport, links } = setup();
      transport.subscribe("a", () => {});
      await vi.advanceTimersByTimeAsync(0);
      links[0].handlers.closed();
      await vi.advanceTimersByTimeAsync(1000);
      links[1].handlers.closed();
      await vi.advanceTimersByTimeAsync(2000);
      links[2].handlers.open();
      await vi.advanceTimersByTimeAsync(STABLE_MS);
      links[2].handlers.closed();
      await vi.advanceTimersByTimeAsync(1000);
      expect(links).toHaveLength(4);
    });

    it("does not start the backoff over for a link that opens and dies at once", async () => {
      const { transport, links } = setup();
      transport.subscribe("a", () => {});
      await vi.advanceTimersByTimeAsync(0);
      links[0].handlers.open();
      links[0].handlers.closed();
      await vi.advanceTimersByTimeAsync(1000);
      links[1].handlers.open();
      links[1].handlers.closed();
      await vi.advanceTimersByTimeAsync(1999);
      expect(links).toHaveLength(2);
      await vi.advanceTimersByTimeAsync(1);
      expect(links).toHaveLength(3);
    });

    it("ignores what an old link says after it was replaced", async () => {
      const { transport, links } = setup();
      const h = vi.fn();
      transport.subscribe("a", h);
      await vi.advanceTimersByTimeAsync(0);
      links[0].handlers.open();
      transport.reconnect();
      await vi.advanceTimersByTimeAsync(0);
      links[1].handlers.open();
      links[0].handlers.message(msg("a"));
      links[0].handlers.closed();
      await vi.advanceTimersByTimeAsync(5000);
      expect(h).not.toHaveBeenCalled();
      expect(links).toHaveLength(2);
      expect(transport.state).toBe("open");
    });
  });

  describe("a link that goes quiet", () => {
    it("is dropped and replaced when nothing, not even a ping, comes for too long", async () => {
      const { transport, links, states } = setup();
      transport.subscribe("a", () => {});
      await vi.advanceTimersByTimeAsync(0);
      links[0].handlers.open();
      await vi.advanceTimersByTimeAsync(SILENCE_MS - 1);
      expect(links).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(links[0].closed).toBe(true);
      expect(states).toEqual(["open", "reconnecting"]);
      await vi.advanceTimersByTimeAsync(10);
      expect(links).toHaveLength(2);
    });

    it("is kept alive by any message", async () => {
      const { transport, links } = setup();
      transport.subscribe("a", () => {});
      await vi.advanceTimersByTimeAsync(0);
      links[0].handlers.open();
      for (let i = 0; i < 5; i++) {
        await vi.advanceTimersByTimeAsync(SILENCE_MS - 1000);
        links[0].handlers.message(msg("a", "ping"));
      }
      expect(links).toHaveLength(1);
    });
  });

  describe("reconnecting on request", () => {
    it("drops the link and makes a new one at once, without a backoff", async () => {
      const { transport, links, states } = setup();
      transport.subscribe("a", () => {});
      await vi.advanceTimersByTimeAsync(0);
      links[0].handlers.open();
      transport.reconnect();
      expect(links[0].closed).toBe(true);
      expect(states).toEqual(["open", "reconnecting"]);
      await vi.advanceTimersByTimeAsync(0);
      expect(links).toHaveLength(2);
    });

    it("also happens when a channel is added to a link that is already up", async () => {
      const { transport, links } = setup();
      transport.subscribe("a", () => {});
      await vi.advanceTimersByTimeAsync(0);
      links[0].handlers.open();
      transport.subscribe("b", () => {});
      await vi.advanceTimersByTimeAsync(0);
      expect(links).toHaveLength(2);
      expect(links[1].channels).toEqual(["a", "b"]);
    });
  });

  it("stops for good when closed: no link, no retries, nothing delivered", async () => {
    const { transport, links, states } = setup();
    const h = vi.fn();
    transport.subscribe("a", h);
    await vi.advanceTimersByTimeAsync(0);
    links[0].handlers.open();
    transport.close();
    expect(links[0].closed).toBe(true);
    expect(transport.state).toBe("closed");
    links[0].handlers.closed();
    links[0].handlers.message(msg("a"));
    transport.reconnect();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(links).toHaveLength(1);
    expect(h).not.toHaveBeenCalled();
    expect(states.at(-1)).toBe("closed");
  });
});
