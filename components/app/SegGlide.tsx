"use client";

import { useEffect, useLayoutEffect, useRef } from "react";

type Spot = { x: number; y: number };
/** `slide` to a new choice, `jump` there at once, or `follow` a track that changed size while a slide is under way. */
type Move = "slide" | "jump" | "follow";

/**
 * The one piece of a segmented control or tab row, drawn once for the track and moved to the chosen piece, so a choice flows
 * into the next one instead of jumping. The edge in front leaves first and the edge behind follows, so for a moment the old
 * piece and the new one are one, then it settles (with a small overshoot: the student app is the livelier of the two). Words
 * pushed aside when the choice moves slide to their new places rather than jump. The chosen piece still says it is the one by
 * itself (a filled glyph, heavier words, its pressed or current state); this only carries the move.
 *
 * Every segmented control and tab row in the student app has one: the tab bar and the welcome screen's language switch. It
 * goes first in the track, whose pieces are its other children; the chosen one is marked `aria-current="page"`,
 * `aria-pressed`, `aria-selected` or `data-checked`.
 *
 * It is placed at once the first time and when the track changes size (zoom, larger text). Between pieces on different rows
 * of a wrapped track it moves at once too: a stretch there would cover the pieces between. With Reduce Motion the style sheet
 * takes the moves away.
 */
export function SegGlide({ at }: { at: string }) {
  const self = useRef<HTMLSpanElement>(null);
  const words = useRef(new WeakMap<Element, Spot>());

  useLayoutEffect(() => {
    if (self.current) place(self.current, words.current, "slide");
  }, [at]);

  useEffect(() => {
    const glide = self.current;
    const track = glide?.parentElement;
    if (!glide || !track || typeof ResizeObserver === "undefined") return;
    let last = "";
    const observer = new ResizeObserver(([entry]) => {
      const size = `${Math.round(entry.contentRect.width)}x${Math.round(entry.contentRect.height)}`;
      // A choice often changes the track's size by a pixel or two (the words grow heavier): a slide under way then goes on
      // to the corrected place instead of being cut short.
      if (last && size !== last) place(glide, words.current, glide.getAnimations().length > 0 ? "follow" : "jump");
      last = size;
    });
    observer.observe(track);
    return () => observer.disconnect();
  }, []);

  return <span ref={self} className="seg__glide" aria-hidden="true" />;
}

const CHOSEN = ':scope > :is([aria-current="page"], [aria-pressed="true"], [aria-selected="true"], [data-checked="true"])';

/** Where an element sits in the track, as laid out (a press or a slide under way does not move this). */
function spotOf(el: HTMLElement, track: HTMLElement): Spot {
  let x = 0;
  let y = 0;
  for (let n: HTMLElement | null = el; n && n !== track; n = n.offsetParent as HTMLElement | null) {
    x += n.offsetLeft;
    y += n.offsetTop;
  }
  return { x, y };
}

function place(glide: HTMLElement, seen: WeakMap<Element, Spot>, move: Move) {
  const track = glide.parentElement;
  // Not laid out (hidden): nothing to measure; the next change or resize places it.
  if (!track || !track.offsetParent) return;
  const piece = track.querySelector<HTMLElement>(CHOSEN);
  if (!piece) {
    glide.dataset.on = "false";
    delete track.dataset.glide;
    return;
  }
  const edges = {
    t: piece.offsetTop,
    r: track.clientWidth - piece.offsetLeft - piece.offsetWidth,
    b: track.clientHeight - piece.offsetTop - piece.offsetHeight,
    l: piece.offsetLeft,
  };
  const from = {
    t: parseFloat(glide.style.getPropertyValue("--seg-t")),
    l: parseFloat(glide.style.getPropertyValue("--seg-l")),
    r: parseFloat(glide.style.getPropertyValue("--seg-r")),
  };
  // Along a row the edge on the side it goes leads; down a column the same, up and down.
  let dir = glide.dataset.dir ?? "";
  if (move === "slide") {
    dir = "";
    if (from.t === edges.t) dir = edges.l > from.l ? "right" : "left";
    else if (from.l === edges.l && from.r === edges.r) dir = edges.t > from.t ? "down" : "up";
  }
  const instant = move === "jump" || !dir || glide.dataset.on !== "true";

  // The words: from where they are seen now (their old place plus any slide still under way) to their new place.
  for (const child of track.children) {
    if (child === glide) continue;
    const word = child.querySelector<HTMLElement>("[data-seg-word]") ?? (child as HTMLElement);
    const now = spotOf(word, track);
    const was = seen.get(word);
    seen.set(word, now);
    if (move !== "slide" || instant || !was) continue;
    const moving = new DOMMatrixReadOnly(getComputedStyle(word).transform);
    const dx = was.x + moving.m41 - now.x;
    const dy = was.y + moving.m42 - now.y;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;
    word.style.transition = "none";
    word.style.transform = `translate(${dx}px, ${dy}px)`;
    void word.offsetWidth;
    word.style.transition = "";
    word.style.transform = "";
  }

  if (instant) glide.style.transition = "none";
  glide.dataset.dir = dir;
  for (const [k, v] of Object.entries(edges)) glide.style.setProperty(`--seg-${k}`, `${v}px`);
  // On in the same frame as the piece's own ground steps aside, so the choice never dims while one hands over to the other.
  glide.dataset.on = "true";
  track.dataset.glide = "on";
  if (instant) {
    void glide.offsetWidth;
    glide.style.transition = "";
  }
}
