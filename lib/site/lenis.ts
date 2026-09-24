import type Lenis from "lenis";

// The page's single smooth-scroll instance, shared by the motion layer and the menu.
// Null under reduced motion, where native scrolling is used.
let instance: Lenis | null = null;

export function setLenis(next: Lenis | null) {
  instance = next;
}

export function getLenis() {
  return instance;
}
