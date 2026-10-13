"use client";

type NavigationLike = { currentEntry: { index: number } | null; entries(): { url: string | null }[] };

/**
 * Whether Back would land on another screen of this app. Uses the Navigation API where the
 * browser has it; without it, it answers no, so callers fall back to replacing with Home.
 */
export function backStaysInApp() {
  try {
    const nav = (window as unknown as { navigation?: NavigationLike }).navigation;
    const i = nav?.currentEntry?.index ?? 0;
    const prev = i > 0 ? nav?.entries()[i - 1]?.url : null;
    return !!prev && /^\/app(\/|$)/.test(new URL(prev).pathname);
  } catch {
    return false;
  }
}

/**
 * Close a screen that works like a modal (the scanner and its result): go back to the screen
 * it was opened from, or replace it with Home when it was opened directly from a link.
 */
export function leave(router: { back(): void; replace(href: string): void }) {
  if (backStaysInApp()) router.back();
  else router.replace("/app");
}
