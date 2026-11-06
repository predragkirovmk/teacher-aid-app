import type { ApiClient } from "./client";
import { createLiveClient } from "./live";
import { watchSession } from "./session";

export { apiMode, demoOnly, type ApiMode } from "./config";
export type { ApiClient } from "./client";
export { ApiError, type ApiErrorCode } from "./errors";
export * from "./types";

// The environment is read inside the condition itself, so a live build drops the mock adapter (its
// fixtures, its quiz driver) along with the branch that would load it. `require` and the inline test
// are what let the bundler prove the branch dead; an `import` at the top of the file always ships it.
/* eslint-disable @typescript-eslint/no-require-imports */

/**
 * The adapter the app talks to, chosen by NEXT_PUBLIC_API_MODE when it is built. Every call is watched
 * for the API saying the session is over (session.ts).
 */
export const client: ApiClient = watchSession(
  process.env.NEXT_PUBLIC_API_MODE === "live" ? createLiveClient() : (require("./mock") as typeof import("./mock")).mockClient,
);

/**
 * What the server render, and the render that hydrates it, may know. In mock mode that is the demo's
 * defaults, so both sides draw the same first frame; live data cannot be known there, so it is null
 * and the first frame is a loading state.
 */
export const serverClient: ApiClient | null =
  process.env.NEXT_PUBLIC_API_MODE === "live" ? null : (require("./mock") as typeof import("./mock")).mockServerClient;
