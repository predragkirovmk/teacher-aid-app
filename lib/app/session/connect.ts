import { ChannelTransport, type RealtimeTransport } from "./transport";
import { sseConnect } from "./sse";

// Read inside the condition itself, so a live build drops the mock lesson along with the branch that
// would load it (see api/index.ts).
/* eslint-disable @typescript-eslint/no-require-imports */
const mock = process.env.NEXT_PUBLIC_API_MODE === "live" ? null : (require("../api/mock/session") as typeof import("../api/mock/session"));

/**
 * The realtime link for a session: the API's event stream in live mode, the scripted lesson in mock
 * mode. Both are a `RealtimeTransport`, so everything above this line is the same code.
 */
export function createTransport(sessionId: string): RealtimeTransport {
  if (process.env.NEXT_PUBLIC_API_MODE === "live") return new ChannelTransport(sseConnect());
  return mock!.mockTransport(sessionId);
}

/**
 * The link to the student's own channel (`student.{id}`), kept for as long as the app is open and the page is shown, so an
 * alert that arrives is seen on whichever screen the student is on. A session's link carries the same channel, but only
 * while its quiz is on screen. One more idle stream (a ping every 20 s, spec 11.4) is the price: the alternative is one
 * shared link that every screen would have to hand over to the next.
 */
export function createStudentTransport(): RealtimeTransport {
  if (process.env.NEXT_PUBLIC_API_MODE === "live") return new ChannelTransport(sseConnect());
  return mock!.mockStudentTransport();
}
