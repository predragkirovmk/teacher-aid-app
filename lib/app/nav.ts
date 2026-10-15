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

/**
 * Back from a screen whose card morphed in (a subject): the card shrinks back into its row on the
 * screen below. React leaves history traversals unanimated on purpose, since a browser's own swipe
 * back has its animation, so the in-app Back button runs this one transition itself. Only the card
 * being left and its row get the shared name, and only while the transition runs.
 */
export function backWithMorph(router: { back(): void }) {
  const name = document.querySelector<HTMLElement>("[data-morph]")?.dataset.morph;
  const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!name || calm || !("startViewTransition" in document)) return router.back();
  const mark = (on: boolean) =>
    document.querySelectorAll<HTMLElement>(`[data-morph="${name}"]`).forEach((el) => {
      el.style.setProperty("view-transition-name", on ? name : null);
      el.style.setProperty("view-transition-class", on ? "morph" : null);
    });
  mark(true);
  const transition = document.startViewTransition(
    () =>
      new Promise<void>((resolve) => {
        // The restored screen renders during popstate; a timeout covers a Back that never lands.
        const done = () => {
          clearTimeout(timer);
          window.removeEventListener("popstate", landed);
          mark(true);
          resolve();
        };
        const landed = () => setTimeout(done, 0);
        const timer = setTimeout(done, 600);
        window.addEventListener("popstate", landed);
        router.back();
      }),
  );
  void transition.finished.finally(() => mark(false));
}
