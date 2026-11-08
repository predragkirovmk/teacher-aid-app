"use client";

import { useEffect, useLayoutEffect, useRef } from "react";

/**
 * The selected row's ground in a menu list, drawn once for the list and slid to the row of the page that opens, so the eye
 * follows the move from one place to the next. The row still says it is the one by itself (bold label, filled icon, and its own
 * ground until this one is placed); this only carries the move. It goes in the list's `nav`, before the `ul`.
 *
 * It is placed at once the first time, when it comes back to a list it had left, and when the rows change size (zoom, a narrow
 * window); it slides only from one row to another. With Reduce Motion the style sheet takes the slide away.
 */
export function NavGlide({ at }: { at: string }) {
  const self = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    if (self.current) place(self.current, true);
  }, [at]);

  useEffect(() => {
    const glide = self.current;
    const nav = glide?.parentElement;
    if (!glide || !nav || typeof ResizeObserver === "undefined") return;
    let last = "";
    const observer = new ResizeObserver(([entry]) => {
      const size = `${Math.round(entry.contentRect.width)}x${Math.round(entry.contentRect.height)}`;
      if (last && size !== last) place(glide, false);
      last = size;
    });
    observer.observe(nav);
    return () => observer.disconnect();
  }, []);

  return <span ref={self} className="nav__glide" aria-hidden="true" />;
}

/** Puts the ground under the list's current row: sliding there when asked and it was already on a row, else at once. */
function place(glide: HTMLElement, slide: boolean) {
  const nav = glide.parentElement;
  if (!nav) return;
  const row = nav.querySelector<HTMLElement>('.nav__item[aria-current="page"]');
  if (!row) {
    glide.dataset.on = "false";
    delete nav.dataset.glide;
    return;
  }
  const instant = !slide || glide.dataset.on !== "true";
  if (instant) glide.style.transition = "none";
  glide.style.height = `${row.offsetHeight}px`;
  glide.style.transform = `translateY(${row.offsetTop}px)`;
  // On in the same frame as the row's own ground steps aside, so the selection never dims while one hands over to the other.
  glide.dataset.on = "true";
  nav.dataset.glide = "on";
  if (instant) {
    // The place and the full strength are taken before the slide comes back, so the next move starts from here.
    void glide.offsetHeight;
    glide.style.transition = "";
  }
}
