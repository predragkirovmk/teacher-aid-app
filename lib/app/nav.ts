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

/** Types the screens' <ViewTransition> maps listen to (see Shell). Untyped navigations do not animate. */
export const FORWARD = { transitionTypes: ["nav-forward"] };
export const BACK = { transitionTypes: ["nav-back"] };

/**
 * The in-app Back. Going back is a history traversal, which React leaves unanimated on purpose (a
 * browser's own swipe back draws its animation), so the in-app button runs the transition itself:
 * the screen being left and the one restored get a shared name by hand, because React only names
 * its boundaries inside transitions it starts, and the subject card morph keeps working the same
 * way. Without view transitions or their types the Back is instant.
 */
export function goBack(router: { back(): void }) {
  const canType = typeof ViewTransition !== "undefined" && "types" in ViewTransition.prototype;
  if (!("startViewTransition" in document) || !canType) return router.back();
  const morph = document.querySelector<HTMLElement>("[data-morph]")?.dataset.morph;
  const screens = () => Array.from(document.querySelectorAll<HTMLElement>(".pager > *"));
  const mark = (el: HTMLElement, name: string | null, cls: string | null) => {
    el.style.setProperty("view-transition-name", name);
    el.style.setProperty("view-transition-class", cls);
  };
  const markMorph = (on: boolean) =>
    morph &&
    document.querySelectorAll<HTMLElement>(`[data-morph="${morph}"]`).forEach((el) => mark(el, on ? morph : null, on ? "morph" : null));
  const left = screens();
  left.forEach((el, i) => mark(el, `screen-out-${i}`, "nav-back lift"));
  markMorph(true);
  const transition = document.startViewTransition({
    types: ["nav-back"],
    update: () =>
      new Promise<void>((resolve) => {
        // The restored screen renders during popstate; a timeout covers a Back that never lands.
        const done = () => {
          clearTimeout(timer);
          window.removeEventListener("popstate", landed);
          screens().forEach((el, i) => !left.includes(el) && mark(el, `screen-in-${i}`, "nav-back"));
          markMorph(true);
          resolve();
        };
        const landed = () => setTimeout(done, 0);
        const timer = setTimeout(done, 600);
        window.addEventListener("popstate", landed);
        router.back();
      }),
  });
  void transition.finished.finally(() => {
    screens().forEach((el) => mark(el, null, null));
    markMorph(false);
  });
}
