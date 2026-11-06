/**
 * The server's clock, as the phone can know it (BR-TIME-03, EC-NET-07). The phone's own clock may be
 * minutes off, so every countdown runs on server time: `server = local + offset`, where the offset is
 * measured when the server tells us its time (a join or a snapshot) and the request's round trip is
 * split evenly between the two directions.
 */
export type ClockSample = {
  /** Add to a local time in ms to get the server's. */
  offset: number;
  /** How long the request that measured it took; a shorter one is a better measurement. */
  rtt: number;
  /** The local time it was taken, to tell an old sample from a recent one. */
  takenAt: number;
};

/** A sample older than this is replaced by any new one, however slow, because the phone's clock drifts. */
const STALE_MS = 120_000;

/** `serverNow` came back in a response that was sent at `sentAt` and received at `receivedAt` (local ms). */
export function sampleClock(serverNow: number, sentAt: number, receivedAt: number): ClockSample {
  const rtt = Math.max(0, receivedAt - sentAt);
  return { offset: serverNow - (sentAt + receivedAt) / 2, rtt, takenAt: receivedAt };
}

/** Keep the better of two samples: the faster round trip, unless the old one has gone stale. */
export function mergeClock(prev: ClockSample | null, next: ClockSample): ClockSample {
  if (!prev) return next;
  return next.rtt <= prev.rtt || next.takenAt - prev.takenAt > STALE_MS ? next : prev;
}

/** Server time for a local time; the phone's own time while nothing has been measured. */
export const toServer = (clock: ClockSample | null, local: number) => local + (clock?.offset ?? 0);

/** The local time at which the server's clock reads `server`. */
export const toLocal = (clock: ClockSample | null, server: number) => server - (clock?.offset ?? 0);
