/**
 * Which adapter the app runs on, fixed when it is built (Next inlines NEXT_PUBLIC_ variables).
 * `mock` plays the whole backend in the browser over a demo school, so the app works with no
 * server; `live` talks to `NEXT_PUBLIC_API_BASE` under `/api/v1`.
 */
export type ApiMode = "mock" | "live";

export const apiMode: ApiMode = process.env.NEXT_PUBLIC_API_MODE === "live" ? "live" : "mock";

/** True only in mock mode: the demo's own controls (the school switch, reset) are shown only then. */
export const demoOnly: boolean = apiMode === "mock";

/** The API's root: NEXT_PUBLIC_API_BASE plus `/api/v1`. An empty base means the same origin. */
export const apiBase = `${(process.env.NEXT_PUBLIC_API_BASE ?? "").replace(/\/+$/, "")}/api/v1`;
