import { sessionEvent } from "../api/wire";
import type { RealtimeMessage, RealtimeTransport } from "./transport";
import { studentChannel } from "./controller";

/**
 * The student's own channel while the app is open (spec 11.2, `student.{id}`): what the server tells the app wherever it is,
 * not only inside a quiz. Two events matter outside a lesson: `notification.created` (the app reads the feed again) and
 * `signed_in_elsewhere` (the full screen, without waiting for the next request to be refused).
 *
 * The link is for a page the student is looking at. A page that has been hidden for `IDLE_MS` lets it go, and takes it up
 * again, with a fresh read of the feed, when it is shown: what happened meanwhile reaches a closed app as a web push, not
 * as a stream held open in a pocket. The transport is made by a function because a closed one cannot be opened again.
 */
export const IDLE_MS = 30_000;

export type StudentStreamDeps = {
  meId: string;
  createTransport(): RealtimeTransport;
  /** A notification was created, or the link came back and may have missed one: read the feed. */
  onNotification(): void;
  onSignedInElsewhere(): void;
  /** Whether the page is being looked at now. */
  visible(): boolean;
  idleMs?: number;
};

export type StudentStream = {
  /** The page was hidden. */
  hide(): void;
  /** The page is shown again. */
  show(): void;
  dispose(): void;
};

export function createStudentStream(deps: StudentStreamDeps): StudentStream {
  let transport: RealtimeTransport | null = null;
  let stops: (() => void)[] = [];
  let idle: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;

  const onMessage = (m: RealtimeMessage) => {
    // The lesson's events on this channel belong to the quiz, which reads them itself; they are none of this stream's business.
    if (m.type !== "notification.created" && m.type !== "signed_in_elsewhere") return;
    let event;
    try {
      event = sessionEvent(m.type, m.data);
    } catch {
      // A body that cannot be read is an event that was not heard: the feed is the truth.
      return deps.onNotification();
    }
    if (event?.type === "notification.created") deps.onNotification();
    else if (event?.type === "signed_in_elsewhere") deps.onSignedInElsewhere();
  };

  function open() {
    if (disposed || transport) return;
    const t = (transport = deps.createTransport());
    stops = [
      t.subscribe(studentChannel(deps.meId), onMessage),
      // Whatever was created while the link was down is gone from it; the link being up again is the cue to read.
      t.onState((state) => state === "open" && deps.onNotification()),
    ];
  }

  function close() {
    stops.forEach((stop) => stop());
    stops = [];
    transport?.close();
    transport = null;
  }

  if (deps.visible()) open();

  return {
    hide() {
      clearTimeout(idle);
      idle = setTimeout(close, deps.idleMs ?? IDLE_MS);
    },
    show() {
      if (disposed) return;
      clearTimeout(idle);
      if (!transport) {
        // Opening reads the feed itself once the link is up.
        open();
        return;
      }
      // A quick look away: the link may have died while the page was frozen, and the feed may have moved.
      if (transport.state !== "open") transport.reconnect();
      deps.onNotification();
    },
    dispose() {
      disposed = true;
      clearTimeout(idle);
      close();
    },
  };
}
