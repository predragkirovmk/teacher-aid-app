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
