/**
 * Which adapter the app runs on, fixed when it is built (Next inlines NEXT_PUBLIC_ variables).
 * `mock` plays the whole backend in the browser, so the app works with no server; `live` talks to
 * `/api/v1` on NEXT_PUBLIC_API_URL.
 */
export type ApiMode = "mock" | "live";

export const apiMode: ApiMode = process.env.NEXT_PUBLIC_API_MODE === "live" ? "live" : "mock";

/**
 * True only in mock mode. Everything the spec has no API for (the timetable and its next-lesson
 * card, the scheduled quiz, the streak badge, documents, the demo clock) is shown only when this
 * is set, so live mode hides it and shows what the API can back.
 */
export const demoOnly: boolean = apiMode === "mock";

/** The API's root: NEXT_PUBLIC_API_URL plus `/api/v1`. Empty origin means same-origin. */
export const apiBase = `${(process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/+$/, "")}/api/v1`;

/** How many notifications one page of the Alerts feed holds (PROPOSED, spec 11.3). The badge counts the unread ones among the pages the app holds. */
export const NOTIFICATIONS_PAGE = 30;
