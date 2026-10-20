import type { ApiClient } from "./client";
import { apiMode } from "./config";
import { createLiveClient } from "./live";
import { mockClient, mockServerClient } from "./mock";

export { apiMode, demoOnly, type ApiMode } from "./config";
export type { ApiClient } from "./client";
export { ApiError, type ApiErrorCode } from "./errors";
export * from "./types";

/** The adapter the app talks to, chosen by NEXT_PUBLIC_API_MODE when it is built. */
export const client: ApiClient = apiMode === "live" ? createLiveClient() : mockClient;

/**
 * What the server render, and the render that hydrates it, may know. In mock mode that is the demo's
 * defaults, so both sides draw the same first frame; live data cannot be known there, so it is null
 * and the first frame is a loading state.
 */
export const serverClient: ApiClient | null = apiMode === "live" ? null : mockServerClient;
