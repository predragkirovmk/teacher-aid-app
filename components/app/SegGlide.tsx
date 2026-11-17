"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { position, sampleSpring, SPRINGS, type Spring } from "@/lib/app/motion";

type Spot = { x: number; y: number };
/** `slide` to a new choice, `jump` there at once, or `follow` a track that changed size while a slide is under way. */
type Move = "slide" | "jump" | "follow";
/** The piece along its row: left edge, right edge, and the width of its round ends. */
type Shape = { l: number; r: number; w: number };
type Slide = { from: Shape; to: Shape; lead: "l" | "r"; start: number };

// The piece goes straight to its place and never past it (the owner's word, 2026-11-17): the trailing edge is the smooth
// spring, which has no bounce, and the leading edge's snappy spring is held at its target (it would pass it by 0.6%).
const LEAD = SPRINGS.snappy;
const TRAIL = SPRINGS.smooth;
const LEAD_MS = sampleSpring(LEAD).ms;
const TRAIL_MS = sampleSpring(TRAIL).ms;
const TRAIL_DELAY = 50;
const TOTAL = Math.max(LEAD_MS, TRAIL_DELAY + TRAIL_MS);
const FRAMES = 48;

/**
 * The one piece of a segmented control or tab row, drawn once for the track and moved to the chosen piece, so a choice flows
 * into the next one instead of jumping. The edge in front leaves first at the snappy spring's pace and the edge behind follows
 * 50 ms later on the smooth one, so for a moment the old piece and the new one are one, then it settles. Neither edge
 * overshoots: where the piece comes to rest is where it goes from the start. Words pushed aside when the choice moves slide to their new places rather than jump.
 * The chosen piece still says it is the one by itself (a filled glyph, heavier words, its pressed or current state); this only
 * carries the move.
 *
 * The piece is two round ends and a flat bridge between their centres, and each moves only by `transform`, from keyframes
 * sampled from the springs in lib/app/motion.ts. So the browser's compositor runs the whole slide: it keeps its pace while the
 * page draws the next screen, and nothing is painted per frame. (A clip-path on animated custom properties, the teacher app's
 * way, is redrawn on the main thread every frame, and stuttered on phones.) The overlapping parts are one group under one
 * opacity, so a translucent piece does not darken where they meet.
 *
 * Every segmented control and tab row in the student app has one: the tab bar and the welcome screen's language switch. It
 * goes first in the track, whose pieces are its other children; the chosen one is marked `aria-current="page"`,
 * `aria-pressed`, `aria-selected` or `data-checked`.
 *
 * It is placed at once the first time, with Reduce Motion, and when the track changes size while still. Between pieces on
 * different rows of a wrapped track it moves at once too: a stretch there would cover the pieces between.
 */
export function SegGlide({ at }: { at: string }) {
  const self = useRef<HTMLSpanElement>(null);
  const words = useRef(new WeakMap<Element, Spot>());
  const slide = useRef<Slide | null>(null);

  useLayoutEffect(() => {
    if (self.current) place(self.current, words.current, slide, "slide");
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
      if (last && size !== last) place(glide, words.current, slide, running(slide.current) ? "follow" : "jump");
      last = size;
    });
    observer.observe(track);
    return () => observer.disconnect();
  }, []);

  return (
    <span ref={self} className="seg__glide" aria-hidden="true">
      <span className="seg__face">
        <span className="seg__cap" />
        <span className="seg__bridge" />
        <span className="seg__cap" />
      </span>
    </span>
  );
}

const CHOSEN = ':scope > :is([aria-current="page"], [aria-pressed="true"], [aria-selected="true"], [data-checked="true"])';

const running = (s: Slide | null) => !!s && performance.now() - s.start < TOTAL;

const settle = (spring: Spring, ms: number, t: number) => (t <= 0 ? 0 : t >= ms ? 1 : Math.min(1, position(spring, t / 1000)));

/** Where the piece is `t` ms into a slide. */
function shapeAt({ from, to, lead }: Slide, t: number): Shape {
  const a = settle(LEAD, LEAD_MS, t);
  const b = settle(TRAIL, TRAIL_MS, t - TRAIL_DELAY);
  const mix = (k: keyof Shape, p: number) => from[k] + (to[k] - from[k]) * p;
  return lead === "r" ? { l: mix("l", b), r: mix("r", a), w: mix("w", a) } : { l: mix("l", a), r: mix("r", b), w: mix("w", a) };
}

/** The transforms of the left end, the bridge and the right end that draw `s`, with ends `size` wide as laid out. */
function transforms(s: Shape, size: number) {
  const k = s.w / size;
  return [
    `translateX(${s.l}px) scaleX(${k})`,
    `translateX(${s.l + s.w / 2}px) scaleX(${Math.max(0.001, s.r - s.l - s.w)})`,
    `translateX(${s.r - s.w}px) scaleX(${k})`,
  ];
}

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

function place(glide: HTMLElement, seen: WeakMap<Element, Spot>, slide: { current: Slide | null }, move: Move) {
  const track = glide.parentElement;
  // Not laid out (hidden): nothing to measure; the next change or resize places it.
  if (!track || !track.offsetParent) return;
  // data-checked first: a tab bar marks the tab just tapped with it while aria-current still names the screen shown.
  const piece = track.querySelector<HTMLElement>(':scope > [data-checked="true"]') ?? track.querySelector<HTMLElement>(CHOSEN);
  if (!piece) {
    glide.dataset.on = "false";
    delete track.dataset.glide;
    return;
  }
  const parts = Array.from(glide.querySelectorAll<HTMLElement>(".seg__face > span"));
  const to: Shape = { l: piece.offsetLeft, r: piece.offsetLeft + piece.offsetWidth, w: piece.offsetWidth };
  const now = performance.now();
  const current = slide.current;
  const from = current && running(current) ? shapeAt(current, now - current.start) : current?.to;
  const sameRow = glide.style.top === `${piece.offsetTop}px`;
  const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const instant = move === "jump" || calm || !from || !sameRow || glide.dataset.on !== "true" || (from.l === to.l && from.r === to.r);

  // The words: from where they are seen now (their old place plus any slide still under way) to their new place.
  for (const child of track.children) {
    if (child === glide) continue;
    const word = child.querySelector<HTMLElement>("[data-seg-word]") ?? (child as HTMLElement);
    const spot = spotOf(word, track);
    const was = seen.get(word);
    seen.set(word, spot);
    if (move !== "slide" || instant || !was) continue;
    const moving = new DOMMatrixReadOnly(getComputedStyle(word).transform);
    const dx = was.x + moving.m41 - spot.x;
    const dy = was.y + moving.m42 - spot.y;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;
    word.style.transition = "none";
    word.style.transform = `translate(${dx}px, ${dy}px)`;
    void word.offsetWidth;
    word.style.transition = "";
    word.style.transform = "";
  }

  for (const part of parts) part.getAnimations().forEach((a) => a.cancel());
  glide.style.top = `${piece.offsetTop}px`;
  glide.style.height = `${piece.offsetHeight}px`;
  // The ends are laid out at the new width; a slide scales them from the old one, which is never far off.
  parts[0].style.width = parts[2].style.width = `${to.w}px`;
  const end = transforms(to, to.w);
  parts.forEach((part, i) => (part.style.transform = end[i]));

  if (instant) {
    slide.current = { from: to, to, lead: "r", start: now - TOTAL };
  } else {
    // Along the row, the edge on the side it goes leads.
    const next: Slide = { from, to, lead: to.l > from.l ? "r" : "l", start: now };
    slide.current = next;
    const frames = Array.from({ length: FRAMES + 1 }, (_, i) => transforms(shapeAt(next, (TOTAL * i) / FRAMES), to.w));
    parts.forEach((part, p) => part.animate(frames.map((f) => ({ transform: f[p] })), { duration: TOTAL, easing: "linear" }));
  }
  // On in the same frame as the piece's own ground steps aside, so the choice never dims while one hands over to the other.
  glide.dataset.on = "true";
  track.dataset.glide = "on";
}
