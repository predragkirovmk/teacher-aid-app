/**
 * The realtime side of a live session (spec 11.2), behind an interface so the provider can change
 * (spec 1.8 has not chosen one) and so the mock lesson and the live API drive the same code.
 *
 * A message is `{ channel, type, data }`. The student listens to `session.{id}.public` and
 * `student.{id}`. Nothing here knows the session: it carries messages, reports whether the link is
 * up, and reconnects with backoff. What to do after a reconnect (ask for the snapshot) is the
 * session controller's job, triggered by the state going back to "open".
 */
export type ConnectionState =
  /** The first connection is being made. */
  | "connecting"
  | "open"
  /** The link dropped; the next attempt is waiting out its backoff or under way. */
  | "reconnecting"
  | "closed";

export type RealtimeMessage = { channel: string; type: string; data: unknown };

export interface RealtimeTransport {
  readonly state: ConnectionState;
  /** Receive the messages of one channel. Returns the way to stop. */
  subscribe(channel: string, handler: (message: RealtimeMessage) => void): () => void;
  /** Hear about every change of `state`. Returns the way to stop. */
  onState(listener: (state: ConnectionState) => void): () => void;
  /** Drop the link and connect again now: for when the page returns to the foreground or the network comes back. */
  reconnect(): void;
  /** Stop for good. */
  close(): void;
}

// ---- Reconnect with backoff -------------------------------------------------------------------------------------

export const BACKOFF = { baseMs: 1000, maxMs: 15_000, jitter: 0.25 } as const;

/** How long to wait before attempt number `attempt` (0 is the first retry): 1 s doubling to 15 s, give or take a quarter. */
export function backoffDelay(attempt: number, random: () => number = Math.random): number {
  const base = Math.min(BACKOFF.maxMs, BACKOFF.baseMs * 2 ** Math.max(0, attempt));
  return Math.round(base * (1 - BACKOFF.jitter + 2 * BACKOFF.jitter * random()));
}

/** Silence on an open link for this long means it died without saying so (the server sends a ping every 20 s). */
export const SILENCE_MS = 45_000;
/** A link that stayed up this long counts as healthy, and the backoff starts over. */
export const STABLE_MS = 5_000;

/** What a provider adapter does on one connection. The channels are fixed for its life. */
export type LinkHandlers = {
  open(): void;
  message(message: RealtimeMessage): void;
  /** The link ended, by error or by the server. */
  closed(): void;
};
export type Link = { close(): void };
export type Connect = (channels: string[], handlers: LinkHandlers) => Link;

type Options = {
  random?: () => number;
  silenceMs?: number;
  stableMs?: number;
};

/**
 * A transport made from a provider's way of making one connection. It keeps the subscriptions across
 * reconnects, opens the link once the channels are known (a subscribe in the same tick joins the same
 * connection), drops a link that has gone silent, and retries with backoff.
 */
export class ChannelTransport implements RealtimeTransport {
  state: ConnectionState = "connecting";
  private handlers = new Map<string, Set<(m: RealtimeMessage) => void>>();
  private listeners = new Set<(s: ConnectionState) => void>();
  private link: Link | null = null;
  /** Identifies the link being made or up; a callback from an older one is ignored. */
  private token: symbol | null = null;
  private linkChannels = "";
  private attempt = 0;
  private timers: { connect?: ReturnType<typeof setTimeout>; silence?: ReturnType<typeof setTimeout>; stable?: ReturnType<typeof setTimeout> } = {};
  private closedForGood = false;
  private readonly random: () => number;
  private readonly silenceMs: number;
  private readonly stableMs: number;

  constructor(
    private readonly connectLink: Connect,
    options: Options = {},
  ) {
    this.random = options.random ?? Math.random;
    this.silenceMs = options.silenceMs ?? SILENCE_MS;
    this.stableMs = options.stableMs ?? STABLE_MS;
  }

  subscribe(channel: string, handler: (message: RealtimeMessage) => void) {
    let set = this.handlers.get(channel);
    if (!set) this.handlers.set(channel, (set = new Set()));
    set.add(handler);
    // The first subscribe opens the link on the next tick, so a second one made right after is on it too;
    // a channel added to a link that is already up needs a new link (the provider fixes channels per link).
    if (!this.token) this.schedule(0);
    else if (this.channelKey() !== this.linkChannels) this.reconnect();
    return () => {
      set!.delete(handler);
      if (set!.size === 0) this.handlers.delete(channel);
    };
  }

  onState(listener: (state: ConnectionState) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  reconnect() {
    if (this.closedForGood) return;
    this.dropLink();
    this.setState("reconnecting");
    this.schedule(0);
  }

  close() {
    this.closedForGood = true;
    this.dropLink();
    clearTimeout(this.timers.connect);
    this.setState("closed");
    this.handlers.clear();
  }

  private channelKey() {
    return [...this.handlers.keys()].sort().join(",");
  }

  private setState(next: ConnectionState) {
    if (this.state === next) return;
    this.state = next;
    this.listeners.forEach((l) => l(next));
  }

  private schedule(ms: number) {
    if (this.closedForGood) return;
    clearTimeout(this.timers.connect);
    this.timers.connect = setTimeout(() => this.connect(), ms);
  }

  private connect() {
    if (this.closedForGood || this.token) return;
    const channels = [...this.handlers.keys()].sort();
    if (channels.length === 0) return;
    this.linkChannels = channels.join(",");
    const token = (this.token = Symbol("link"));
    const current = () => this.token === token;
    const link = this.connectLink(channels, {
      open: () => {
        if (!current()) return;
        this.setState("open");
        this.armSilence();
        clearTimeout(this.timers.stable);
        this.timers.stable = setTimeout(() => (this.attempt = 0), this.stableMs);
      },
      message: (m) => {
        if (!current()) return;
        this.armSilence();
        this.handlers.get(m.channel)?.forEach((h) => h(m));
      },
      closed: () => {
        if (!current()) return;
        this.dropLink();
        this.setState("reconnecting");
        this.schedule(backoffDelay(this.attempt++, this.random));
      },
    });
    // A link that was dropped while it was being made (a callback closed it at once) must not stay.
    if (current()) this.link = link;
    else link.close();
  }

  private armSilence() {
    clearTimeout(this.timers.silence);
    this.timers.silence = setTimeout(() => {
      // Nothing, not even a ping: the link is dead. Reconnect without the backoff, the network may be fine.
      this.reconnect();
    }, this.silenceMs);
  }

  private dropLink() {
    clearTimeout(this.timers.silence);
    clearTimeout(this.timers.stable);
    const link = this.link;
    this.link = null;
    this.token = null;
    link?.close();
  }
}
