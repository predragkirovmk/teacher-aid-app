"use client";

import { useEffect } from "react";
import { CLASS_SIZE } from "@/lib/site-v2/classroom";
import { setLenis } from "@/lib/site-v2/lenis";

type Flags = { __taMotion?: boolean; __taMotionSoon?: boolean };
type Conditions = { fine: boolean; narrow: boolean; tall: boolean };
const QUERIES = { fine: "(hover: hover) and (pointer: fine)", narrow: "(max-width: 767px)", tall: "(min-height: 520px)" };

// Gives the main thread back between the scenes, so building the motion layer is a row of short
// tasks a tap can get between, not one long one.
function nextTask() {
  const s = (globalThis as { scheduler?: { yield?: () => Promise<void> } }).scheduler;
  return s?.yield ? s.yield() : new Promise<void>((resolve) => setTimeout(resolve, 0));
}

/**
 * Calls `play` once for each of `els` when its top comes above `at` (a fraction of the screen's
 * height from the top), like a ScrollTrigger with `once: true` and `start: "top <at>"`; one that
 * is already above that line (a reload halfway down) plays at once. The intersection observer
 * works off the main thread and reads no layout, where each ScrollTrigger measured its element as
 * it was made: one forced reflow per element. Returns the disconnect.
 */
function onceInView(els: Element[], at: number, play: (els: HTMLElement[]) => void) {
  const io = new IntersectionObserver(
    (entries) => {
      const hits = entries.filter((e) => e.isIntersecting || e.boundingClientRect.bottom <= 0).map((e) => e.target as HTMLElement);
      if (!hits.length) return;
      hits.forEach((el) => io.unobserve(el));
      play(hits.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1)));
    },
    { rootMargin: `0px 0px ${-Math.round((1 - at) * 100)}% 0px` },
  );
  els.forEach((el) => io.observe(el));
  return () => io.disconnect();
}

// An element's layout box relative to `root`, ignoring transforms, so a scrubbed timeline can be
// measured again at any progress.
function box(el: HTMLElement, root: HTMLElement) {
  let x = 0;
  let y = 0;
  let n: HTMLElement | null = el;
  while (n && n !== root) {
    x += n.offsetLeft;
    y += n.offsetTop;
    n = n.offsetParent as HTMLElement | null;
  }
  return { x, y, w: el.offsetWidth, h: el.offsetHeight };
}

/**
 * The page's motion layer. The page is complete without it; this arrives after the page has
 * loaded (GSAP, ScrollTrigger and Lenis are fetched only now, so they never hold up the hero or
 * its largest paint) and adds the scroll scenes and reveals. It starts once the main thread is
 * idle after load, or at the first touch, wheel or key if that comes sooner, and builds one scene
 * per task. Nothing runs under prefers-reduced-motion.
 *
 * Phones get the same choreography as desktop. What keeps them smooth is what is animated: only
 * transform and opacity, on elements that do not blur, filter or cast moving shadows.
 */
export function Motion() {
  useEffect(() => {
    const html = document.documentElement;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduce.matches) {
      html.classList.remove("motion");
      return;
    }

    const flags = window as unknown as Flags;
    // The page has hydrated, so the layer is coming: the guard in the head keeps .motion on. If the
    // layer has not arrived a while after it set out, the page shows as it is.
    flags.__taMotionSoon = true;
    let giveUp = 0;
    let cleanup = () => {};
    let cancelled = false;
    let started = false;

    const inputs = ["pointerdown", "touchstart", "wheel", "keydown", "scroll"] as const;
    const start = () => {
      if (started || cancelled) return;
      started = true;
      detach();
      giveUp = window.setTimeout(() => flags.__taMotion || html.classList.remove("motion"), 8000);
      Promise.all([import("gsap"), import("gsap/ScrollTrigger"), import("lenis")])
        .then((mods) => build(...mods))
        .catch(() => html.classList.remove("motion"));
    };
    // Safari has no requestIdleCallback; a short timeout after load stands in for it.
    const idle = () => (typeof requestIdleCallback === "function" ? requestIdleCallback(start, { timeout: 1200 }) : setTimeout(start, 200));
    const fallback = window.setTimeout(start, 4000);
    const detach = () => {
      inputs.forEach((type) => window.removeEventListener(type, start));
      window.removeEventListener("load", idle);
      window.clearTimeout(fallback);
    };
    inputs.forEach((type) => window.addEventListener(type, start, { once: true, passive: true }));
    if (document.readyState === "complete") idle();
    else window.addEventListener("load", idle, { once: true });

    const build = async (
      { gsap }: typeof import("gsap"),
      { ScrollTrigger }: typeof import("gsap/ScrollTrigger"),
      { default: Lenis }: typeof import("lenis"),
    ) => {
      if (cancelled) return;
      html.classList.add("motion");
      gsap.registerPlugin(ScrollTrigger);
      ScrollTrigger.config({ ignoreMobileResize: true });
      const mm = gsap.matchMedia();
      const stopReveals: (() => void)[] = [];

      // Every refresh re-reads the scrubbed scenes' function values, several for each tween and
      // in between GSAP's own style writes, so each layout read there would force a reflow of its
      // own. These measure once per refresh and hand the same numbers to every value that asks.
      let refreshes = 0;
      const countRefresh = () => void refreshes++;
      ScrollTrigger.addEventListener("refreshInit", countRefresh);
      const perRefresh = <T,>(read: () => T) => {
        let at = -1;
        let value: T;
        return () => {
          if (at !== refreshes) {
            value = read();
            at = refreshes;
          }
          return value;
        };
      };

      // A sticky stage held in the middle of the screen (In class, the answer): its run is the
      // stage and the scroll it holds still for (.live__run, .answer__run). Its sticky top comes
      // from its height; the scrub starts as it sticks and ends as it lets go.
      const centred = (pin: HTMLElement) => {
        const run = pin.parentElement as HTMLElement;
        const top = perRefresh(() => Math.round((window.innerHeight - pin.offsetHeight) / 2));
        const travel = perRefresh(() => run.offsetHeight - pin.offsetHeight);
        const stick = () => void (pin.style.top = `${top()}px`);
        stick();
        ScrollTrigger.addEventListener("refreshInit", stick);
        return {
          scroll: { trigger: run, start: () => `top ${top()}px`, end: () => `+=${travel()}` },
          stop: () => {
            ScrollTrigger.removeEventListener("refreshInit", stick);
            pin.style.top = "";
          },
        };
      };

      cleanup = () => {
        mm.revert();
        stopReveals.forEach((stop) => stop());
        ScrollTrigger.removeEventListener("refreshInit", countRefresh);
      };
      type Timeline = ReturnType<typeof gsap.timeline>;
      type Scroll = Parameters<typeof ScrollTrigger.create>[0] & { trigger: HTMLElement };
      // The scenes' ScrollTriggers wait here while the scenes are built, one per task, and are
      // then made together and measured by one refresh. Made with their scenes, they would be
      // measured between the tasks, and more than once: each timeline's ScrollTrigger refreshes
      // itself a tick after it is made.
      let waiting: (() => void)[] | null = [];

      // Each scene is its own matchMedia entry, so a change of conditions rebuilds them all (then
      // nothing waits) and mm.revert() undoes them all. `scrub` ties a paused timeline to the
      // scroll. Nothing is pinned by ScrollTrigger: the scenes that hold still are sticky in the
      // stylesheet, so a refresh only measures, and each tween starts when the scroll first
      // reaches it rather than all of them at once to work out a pin.
      const scene = (fn: (c: Conditions, scrub: (tl: Timeline, vars: Scroll) => void) => void | (() => void)) =>
        mm.add(QUERIES, (ctx) => {
          let current = true;
          const scrub = (tl: Timeline, vars: Scroll) => {
            const make = () => void ScrollTrigger.create({ ...vars, animation: tl });
            if (waiting) waiting.push(() => current && ctx.add(make));
            else make();
          };
          const undo = fn(ctx.conditions as Conditions, scrub);
          return () => {
            current = false;
            undo?.();
          };
        });

      scene(({ fine }) => {
        // Smooth wheel scrolling on GSAP's ticker, so Lenis and ScrollTrigger share one clock.
        // Touch keeps native scrolling: its momentum is already smooth and smoothing it adds lag.
        const lenis = fine ? new Lenis({ duration: 1.1, easing: (x) => Math.min(1, 1.001 - Math.pow(2, -10 * x)) }) : null;
        const raf = (time: number) => lenis?.raf(time * 1000);
        if (lenis) {
          setLenis(lenis);
          lenis.on("scroll", ScrollTrigger.update);
          gsap.ticker.add(raf);
          gsap.ticker.lagSmoothing(0);
        }

        // Anchor links glide with Lenis; without it the browser's own smooth scroll does.
        const onAnchor = (e: MouseEvent) => {
          const a = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[href^="#"]');
          if (!a || !lenis || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey) return;
          const target = document.querySelector<HTMLElement>(a.getAttribute("href")!);
          if (!target) return;
          e.preventDefault();
          // Focus moves at once (keyboard users, the skip link); the page glides after it and lands
          // the target just under the fixed bar: Lenis keeps the page's scroll-padding-top, the
          // bar's height, so no offset is added here.
          target.focus({ preventScroll: true });
          lenis.scrollTo(target, { duration: 1.3 });
        };
        document.addEventListener("click", onAnchor);

        return () => {
          document.removeEventListener("click", onAnchor);
          if (lenis) {
            gsap.ticker.remove(raf);
            lenis.destroy();
            setLenis(null);
          }
        };
      });

      // A number that counts while a timeline plays, written into each of `els`. The play-once
      // timelines below set their start states first and then only tween to the end.
      const counter = (tl: ReturnType<typeof gsap.timeline>, els: (Element | null)[], from: number, to: number, duration: number, at: number | string) => {
        const o = { n: from };
        const write = () => els.forEach((e) => e && (e.textContent = String(Math.round(o.n))));
        write();
        tl.to(o, { n: to, duration, ease: "none", onUpdate: write }, at);
      };

      await nextTask();
      if (cancelled) return;

      scene(({ fine, narrow, tall }, scrub) => {
        /* The hero (act 1): held still for two screens of scroll. The text clears and the stage
           rises, the headline settles as the scene's caption, the laptop settles on the desk and
           the student's phone moves to the front of the stack beside it. The other 28 phones of the class
           are dealt up behind it, then answer: their edges light yellow in a wave from the
           front to the back while the count climbs to 29. Only a few layers move at once.
           Both layouts are CSS (the start is the page, the end is .hero__end), measured here
           on every refresh. */
        const hero = document.querySelector<HTMLElement>("[data-hero]");
        const q = <T extends Element>(sel: string) => Array.from(hero?.querySelectorAll<T>(sel) ?? []);
        // The hero's one screen, sticky while the scene plays; everything is measured inside it.
        const frame = q<HTMLElement>("[data-hero-frame]")[0];
        const title = q<HTMLElement>("[data-hero-title]")[0];
        const titleEnd = q<HTMLElement>("[data-hero-title-end]")[0];
        const stage = q<HTMLElement>(".hero__stage")[0];
        const laptop = q<HTMLElement>(".hero__laptop")[0];
        const phone = q<HTMLElement>(".hero__phone")[0];
        const front = q<HTMLElement>("[data-stack-front]")[0];
        const desk = q<HTMLElement>("[data-hero-desk]")[0];
        const cards = q<HTMLElement>("[data-card]");
        const num = q<HTMLElement>("[data-count]")[0];
        let heroTl: ReturnType<typeof gsap.timeline> | null = null;

        // The scene needs room: on short screens the hero stays as it is (see .motion .hero).
        if (tall && hero && frame && title && titleEnd && stage && laptop && phone && front && desk && cards.length && num) {
          // The entrance runs in CSS; once it has played (or the first scroll cuts it short) it is
          // cancelled, so its fill never overrides the scene. Its end state is the base style.
          const entrance = hero.getAnimations({ subtree: true });
          const settle = () => {
            entrance.forEach((a) => a.cancel());
            hero.classList.add("is-entered");
          };
          Promise.all(entrance.map((a) => a.finished.catch(() => {}))).then(settle);

          // First the laptop and the phone rise so the laptop shows itself, its top just under the
          // headline (lower on wide screens, where the headline is taller); then each travels to
          // its place. They move on their own, never the stage, so the stage stays flat and the
          // stack can stand between them: the laptop behind it, the phone in front.
          const rise = perRefresh(() => Math.min(0, frame.offsetHeight * (narrow ? 0.42 : 0.58) - box(stage, frame).y));
          const flip = (el: HTMLElement, to: HTMLElement, origin: "top" | "center") =>
            perRefresh(() => {
              const a = box(el, frame);
              const b = box(to, frame);
              const scale = b.w / a.w;
              const dy = origin === "top" ? b.y - a.y : b.y + b.h / 2 - (a.y + a.h / 2);
              return { x: b.x + b.w / 2 - (a.x + a.w / 2), y: dy, scale };
            });
          const titleTo = perRefresh(() => {
            const a = box(title, frame);
            const b = box(titleEnd, frame);
            const scale = parseFloat(getComputedStyle(titleEnd).fontSize) / parseFloat(getComputedStyle(title).fontSize);
            return { x: b.x - a.x, y: b.y - a.y, scale };
          });
          // GSAP re-reads function values on every refresh, so the scene follows any resize.
          const toward = (m: () => { x: number; y: number; scale: number }) => ({
            x: () => m().x,
            y: () => m().y,
            scale: () => m().scale,
          });
          // Each card behind the front sits one step higher and a little narrower.
          const step = perRefresh(() => front.offsetWidth * 0.03);
          gsap.set(cards, { transformOrigin: "50% 0%", scale: (i) => 1 - (i + 1) * 0.008 });
          const count = { n: 1 };

          // The frame's run: the hero's height less its own (two screens, in the stylesheet).
          const travel = perRefresh(() => hero.offsetHeight - frame.offsetHeight);
          heroTl = gsap.timeline({ defaults: { ease: "none" }, paused: true });
          scrub(heroTl, {
            trigger: hero,
            start: "top top",
            end: () => `+=${travel()}`,
            scrub: fine ? 0.6 : 0.35,
            invalidateOnRefresh: true,
            onUpdate: (st) => {
              if (st.progress > 0 && !hero.classList.contains("is-entered")) settle();
            },
          });

          heroTl
            // From explicit values: the CSS entrance may still be mid-way when this is built.
            .fromTo("[data-hero-out]", { y: 0, autoAlpha: 1 }, { y: -48, autoAlpha: 0, duration: 1.2 }, 0)
            .to([laptop, phone], { y: () => rise(), duration: 1.6, ease: "power2.out" }, 0)
            .to(title, { ...toward(titleTo), transformOrigin: "0 0", duration: 2.8, ease: "power2.inOut" }, 0.2)
            // The teacher's laptop settles on the desk; the student's phone goes to the class.
            .to(laptop, { ...toward(flip(laptop, desk, "top")), transformOrigin: "50% 0%", duration: 2.2, ease: "power2.inOut" }, 1.6)
            .to(phone, { ...toward(flip(phone, front, "center")), duration: 2.2, ease: "power3.inOut" }, 1.8)
            .to("[data-stack]", { autoAlpha: 1, duration: 0.01 }, 3.6)
            // The class is dealt up behind the front phone, nearest first.
            .fromTo(cards, { y: 0 }, { y: (i) => -(i + 1) * step(), duration: 0.6, ease: "power2.out", stagger: { amount: 1.6 } }, 3.6)
            .fromTo("[data-hero-count]", { autoAlpha: 0, y: 12 }, { autoAlpha: 1, y: 0, duration: 0.6, ease: "power2.out" }, 4.8)
            // Then they answer, front to back, and the count keeps pace.
            .to("[data-lit]", { opacity: 1, duration: 0.3, stagger: { amount: 3.4, ease: "sine.inOut" } }, 5.4)
            .to(count, { n: CLASS_SIZE, duration: 3.7, onUpdate: () => (num.textContent = String(Math.round(count.n))) }, 5.4)
            .to({}, { duration: 1 });
        }
        return () => {
          heroTl?.scrollTrigger?.kill();
          heroTl?.kill();
        };
      });

      await nextTask();
      if (cancelled) return;

      scene(({ fine }, scrub) => {
        /* The teacher chapter opens: the laptop grows as it comes up the screen until it fills
           it, one layer scaling with the scroll. */
        const openerLaptop = document.querySelector<HTMLElement>(".opener__laptop");
        if (openerLaptop) {
          const tl = gsap.timeline({ paused: true }).fromTo(openerLaptop, { scale: 0.76, y: 40 }, { scale: 1, y: 0, ease: "none" });
          scrub(tl, { trigger: openerLaptop, start: "top bottom", end: "center center", scrub: fine ? 0.6 : 0.35 });
        }

        /* In class (act 2, climax): the stage holds still for three screens of scroll and plays one
           question through. Students join, the teacher clicks Send, the question flies from the
           laptop to the board, the answers come in on both screens, and the right one is
           revealed. One caption per beat. */
        const live = document.querySelector<HTMLElement>("[data-live]");
        const liveStage = live?.querySelector<HTMLElement>(".live__stage");
        const L = <T extends Element = HTMLElement>(sel: string) => live?.querySelector<T>(sel) ?? null;
        const LA = (sel: string) => Array.from(live?.querySelectorAll<HTMLElement>(sel) ?? []);
        const boardQ = L("[data-board-question]");
        const row = L("[data-send-row]");
        const card = L("[data-flycard]");
        let placeCard: (() => void) | null = null;
        let stage: ReturnType<typeof centred> | null = null;

        if (live && liveStage && boardQ && row && card) {
          const steps = LA("[data-step]");
          const bars = LA("[data-bar]");
          const fills = LA("[data-bar-fill]");
          const send = L("[data-send]");
          const revealBtn = L("[data-reveal-btn]");

          // The card is the board's question, laid over it at its size and type; it starts
          // shrunk onto the console's row and flies home.
          placeCard = () => {
            const b = box(boardQ, liveStage);
            Object.assign(card.style, { left: `${b.x}px`, top: `${b.y}px`, width: `${b.w}px`, fontSize: getComputedStyle(boardQ).fontSize });
          };
          placeCard();
          ScrollTrigger.addEventListener("refreshInit", placeCard);
          const fromRow = perRefresh(() => {
            const a = box(row, liveStage);
            const b = box(boardQ, liveStage);
            const scale = a.w / b.w;
            return { x: a.x - b.x, y: a.y + (a.h - b.h * scale) / 2 - b.y, scale };
          });

          gsap.set(steps, { autoAlpha: (i) => (i === 0 ? 1 : 0) });
          gsap.set(L("[data-board-lobby]"), { autoAlpha: 1 });
          gsap.set(L("[data-board-q]"), { autoAlpha: 0 });
          gsap.set(L("[data-send-label]"), { opacity: 1 });
          gsap.set(L("[data-sent-label]"), { opacity: 0 });
          gsap.set(fills, { scaleX: 0 });
          gsap.set([...LA("[data-bar-pct]"), L("[data-ring]"), L("[data-reveal-fill]")], { opacity: 0 });

          const tl = gsap.timeline({ defaults: { ease: "none" }, paused: true });
          stage = centred(live);
          scrub(tl, { ...stage.scroll, scrub: fine ? 0.6 : 0.35, invalidateOnRefresh: true });
          const beat = (i: number, at: number) =>
            tl
              .to(steps[i - 1], { autoAlpha: 0, y: -10, duration: 0.22 }, at)
              .fromTo(steps[i], { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: 0.35 }, at + 0.26);

          // 1. Students scan in.
          counter(tl, [L("[data-joined]"), L("[data-c-joined]")], 0, 27, 1.8, 0.2);
          // 2. Send: the button presses, the question leaves the laptop for the board.
          beat(1, 2.1);
          tl.to(send, { scale: 0.95, duration: 0.12 }, 2.3)
            .to(send, { scale: 1, duration: 0.2 }, 2.42)
            .to(L("[data-send-label]"), { opacity: 0, duration: 0.15 }, 2.45)
            .to(L("[data-sent-label]"), { opacity: 1, duration: 0.15 }, 2.45)
            .fromTo(card, { autoAlpha: 0, x: () => fromRow().x, y: () => fromRow().y, scale: () => fromRow().scale }, { autoAlpha: 1, duration: 0.15 }, 2.4)
            .to(card, { x: 0, y: 0, scale: 1, duration: 1.2, ease: "power2.inOut" }, 2.55)
            .to(L("[data-board-lobby]"), { autoAlpha: 0, duration: 0.4 }, 2.9)
            .to(L("[data-board-q]"), { autoAlpha: 1, duration: 0.4 }, 3.2)
            .to(L("[data-flycard-bg]"), { opacity: 0, duration: 0.3 }, 3.5)
            .to(card, { autoAlpha: 0, duration: 0.2 }, 3.85);
          // 3. The answers come in on the board and the console; the timer runs down.
          beat(2, 3.9);
          counter(tl, [L("[data-answered]"), L("[data-c-answered]")], 0, 24, 2.6, 4);
          counter(tl, [L("[data-timer]")], 20, 0, 2.6, 4);
          tl.to(fills, { scaleX: (_, el) => parseFloat((el as HTMLElement).parentElement?.style.getPropertyValue("--share") ?? "0"), duration: 2.4, ease: "power1.out", stagger: 0.05 }, 4.1);
          // 4. Reveal: the button presses, the right answer rings, the rest step back.
          beat(3, 6.8);
          tl.to(revealBtn, { scale: 0.95, duration: 0.12 }, 6.9)
            .to(revealBtn, { scale: 1, duration: 0.2 }, 7.02)
            .to(L("[data-reveal-fill]"), { opacity: 1, duration: 0.2 }, 6.95)
            .to(L("[data-ring]"), { opacity: 1, duration: 0.35 }, 7.1)
            .to(bars.filter((b) => !b.classList.contains("is-right")), { opacity: 0.55, duration: 0.35 }, 7.1)
            .to(LA("[data-bar-pct]"), { opacity: 1, duration: 0.35 }, 7.1)
            .to({}, { duration: 1.6 });
        }
        return () => {
          if (placeCard) ScrollTrigger.removeEventListener("refreshInit", placeCard);
          stage?.stop();
        };
      });

      await nextTask();
      if (cancelled) return;

      scene(({ fine, narrow }, scrub) => {
        const stops: (() => void)[] = [];
        /* Student, answer (the chapter's climax): the phone holds still for a little over two screens and
           steps through four captures of the real app's lesson: the question with its timer,
           the answer locked in after one tap, "Correct! +15", and the place in the quiz. */
        const answerPin = document.querySelector<HTMLElement>("[data-answer-pin]");
        const shots = Array.from(answerPin?.querySelectorAll<HTMLElement>("[data-ans-shot]") ?? []);
        if (answerPin && shots.length === 4) {
          const steps = Array.from(answerPin.querySelectorAll<HTMLElement>("[data-ans-step]"));
          const tap = answerPin.querySelector<HTMLElement>("[data-ans-tap]");
          gsap.set(steps, { autoAlpha: (i) => (i === 0 ? 1 : 0) });
          gsap.set(shots.slice(1), { autoAlpha: 0 });
          gsap.set(tap, { opacity: 0 });

          const tl = gsap.timeline({ defaults: { ease: "none" }, paused: true });
          // Every value here is fixed, so a refresh need not start the timeline over.
          const held = centred(answerPin);
          stops.push(held.stop);
          scrub(tl, { ...held.scroll, scrub: fine ? 0.6 : 0.35 });
          const beat = (i: number, at: number) =>
            tl
              .to(steps[i - 1], { autoAlpha: 0, y: -10, duration: 0.22 }, at)
              .fromTo(steps[i], { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: 0.35 }, at + 0.26);
          // A screen arrives: it settles from a touch larger as it fades in.
          const arrive = (shot: HTMLElement, at: number) =>
            tl.fromTo(shot, { autoAlpha: 0, scale: 1.03 }, { autoAlpha: 1, scale: 1, duration: 0.22, ease: "power2.out", immediateRender: false }, at);

          // 1. The question, with its timer. 2. One tap: the thumb lands, the answer locks in.
          beat(1, 1.6);
          tl.fromTo(tap, { opacity: 0.6, scale: 0.6 }, { opacity: 0, scale: 1.5, duration: 0.45, ease: "power2.out", immediateRender: false }, 1.9);
          arrive(shots[1], 2.05);
          // 3. Correct: 10 for the answer and 5 for speed.
          beat(2, 3.4);
          arrive(shots[2], 3.6);
          // 4. The place in the quiz, live.
          beat(3, 5.2);
          arrive(shots[3], 5.4);
          tl.to({}, { duration: 1.2 });
        }

        /* The director's report: page two fans out from behind page one as the pages come up the
           screen (beside it on wide screens, below it on phones), then each page's figures
           fill in once it is in view. Two layers move; their end places are the CSS layout. */
        const report = document.querySelector<HTMLElement>("[data-report]");
        const sheets = Array.from(report?.querySelectorAll<HTMLElement>("[data-sheet]") ?? []);
        if (report && sheets.length === 2) {
          const [one, two] = sheets;
          const tuck = perRefresh(() => {
            const a = box(one, report);
            const b = box(two, report);
            // Peeking out to the side on wide screens, below on phones (inside the screen's edge).
            return { x: a.x - b.x + (narrow ? 0 : a.w * 0.06), y: a.y - b.y + a.h * 0.03 };
          });
          const fan = gsap
            .timeline({ defaults: { ease: "power2.out" }, paused: true })
            .fromTo(two, { x: () => tuck().x, y: () => tuck().y, rotation: 4 }, { x: 0, y: 0, rotation: 0 }, 0)
            .fromTo(one, { rotation: -2 }, { rotation: 0 }, 0);
          scrub(fan, { trigger: report, start: "top 80%", end: "center center", scrub: fine ? 0.6 : 0.35, invalidateOnRefresh: true });

          const S = (el: HTMLElement, sel: string) => Array.from(el.querySelectorAll<HTMLElement>(sel));
          const share = (el: Element) => parseFloat((el as HTMLElement).style.getPropertyValue("--v"));
          gsap.set(S(one, "[data-report-bar]"), { scaleY: 0 });
          gsap.set(S(two, "[data-report-meter]"), { scaleX: 0 });
          const first = gsap.timeline({ paused: true, defaults: { ease: "power3.out" } });
          S(one, "[data-report-n]").forEach((b) => counter(first, [b], 0, Number(b.dataset.reportN), 1.1, 0));
          first.to(S(one, "[data-report-bar]"), { scaleY: (_, el) => share(el), duration: 0.8, stagger: 0.05 }, 0.2);
          const second = gsap.timeline({ paused: true, defaults: { ease: "power3.out" } });
          second.to(S(two, "[data-report-meter]"), { scaleX: (_, el) => share(el), duration: 0.9, stagger: 0.08 });
          stops.push(onceInView([one, two], 0.6, (els) => els.forEach((el) => void (el === one ? first : second).play())));
        }
        return () => stops.forEach((stop) => stop());
      });
      await nextTask();
      if (cancelled) return;

      // All the ScrollTriggers at once, in the page's order, and measured now, once: refreshed
      // here, none of them refreshes itself later.
      const made = waiting;
      waiting = null;
      made.forEach((make) => make());
      ScrollTrigger.refresh();
      await nextTask();
      if (cancelled) return;

      // The play-once scenes start when they come into view, watched by intersection observers.
      scene(() => {
        const stops: (() => void)[] = [];
        /* After class: the attendance tiles count in and the most-missed questions fill. */
        const end = document.querySelector<HTMLElement>("[data-end]");
        if (end) {
          const E = (sel: string) => Array.from(end.querySelectorAll<HTMLElement>(sel));
          gsap.set(E("[data-end-stat]"), { y: 12, autoAlpha: 0 });
          gsap.set(E("[data-end-row]"), { y: 10, autoAlpha: 0 });
          gsap.set(E("[data-end-fill]"), { scaleX: 0 });
          const tl = gsap.timeline({ paused: true, defaults: { ease: "power3.out" } });
          tl.to(E("[data-end-stat]"), { y: 0, autoAlpha: 1, duration: 0.5, stagger: 0.1 });
          E("[data-end-n]").forEach((b) => counter(tl, [b], 0, Number(b.dataset.endN), 0.9, 0.1));
          tl.to(E("[data-end-row]"), { y: 0, autoAlpha: 1, duration: 0.5, stagger: 0.1 }, 0.5)
            .to(E("[data-end-fill]"), { scaleX: (_, el) => parseFloat((el as HTMLElement).parentElement?.style.getPropertyValue("--share") ?? "0"), duration: 0.9, stagger: 0.1 }, 0.7);
          stops.push(onceInView([end], 0.75, () => void tl.play()));
        }

        /* Results: the attendance bars grow, then the topics and the questions arrive. */
        const results = document.querySelector<HTMLElement>("[data-results]");
        if (results) {
          const R = (sel: string) => Array.from(results.querySelectorAll<HTMLElement>(sel));
          gsap.set(R("[data-res-bar]"), { scaleY: 0 });
          gsap.set(R("[data-res-row]"), { y: 10, autoAlpha: 0 });
          gsap.set(R("[data-res-fill]"), { scaleX: 0 });
          const tl = gsap.timeline({ paused: true, defaults: { ease: "power3.out" } });
          tl.to(R("[data-res-bar]"), { scaleY: (_, el) => parseFloat((el as HTMLElement).style.getPropertyValue("--v")), duration: 0.8, stagger: 0.05 })
            .to(R("[data-res-row]"), { y: 0, autoAlpha: 1, duration: 0.5, stagger: 0.08 }, 0.4)
            .to(R("[data-res-fill]"), { scaleX: (_, el) => parseFloat((el as HTMLElement).parentElement?.style.getPropertyValue("--share") ?? "0"), duration: 0.9, stagger: 0.1 }, 0.6);
          stops.push(onceInView([results], 0.75, () => void tl.play()));
        }

        /* Student, scan: once the phone is in view, the app's scanner gives way to the lesson
           it opens: in, with the classmates already there. Both are captures of the real app. */
        const scanIn = document.querySelector<HTMLElement>("[data-scan-in]");
        if (scanIn) {
          gsap.set(scanIn, { autoAlpha: 0, scale: 1.04 });
          const tl = gsap.timeline({ paused: true });
          tl.to(scanIn, { autoAlpha: 1, scale: 1, duration: 0.6, ease: "power3.out", delay: 0.9 });
          stops.push(onceInView([scanIn.closest(".phone") ?? scanIn], 0.65, () => void tl.play()));
        }

        /* What is never kept: once the list is in view, a line is drawn through each word in turn. */
        const never = document.querySelector<HTMLElement>("[data-never]");
        if (never) {
          const strikes = Array.from(never.querySelectorAll<HTMLElement>("[data-strike]"));
          gsap.set(strikes, { scaleX: 0 });
          const tl = gsap.timeline({ paused: true });
          tl.to(strikes, { scaleX: 1, duration: 0.5, ease: "power2.inOut", stagger: 0.22, delay: 0.6 });
          stops.push(onceInView([never], 0.7, () => void tl.play()));
        }
        return () => stops.forEach((stop) => stop());
      });
      await nextTask();
      if (cancelled) return;

      // Reveals: each block rises into place as it enters, in reading order, once (the rise is in
      // the stylesheet, under .motion [data-reveal]). Blocks that enter together follow each other.
      const narrowNow = window.matchMedia(QUERIES.narrow).matches;
      stopReveals.push(
        onceInView(Array.from(document.querySelectorAll("[data-reveal]:not(.is-in)")), 0.86, (els) =>
          els.forEach((el, i) => {
            el.style.setProperty("--d", `${i * (narrowNow ? 60 : 80)}ms`);
            el.classList.add("is-in");
          }),
        ),
      );

      flags.__taMotion = true;
      window.clearTimeout(giveUp);
      // Web fonts change the headline's measure: measure the scenes again once they are in.
      if (document.fonts.status !== "loaded") document.fonts.ready.then(() => !cancelled && ScrollTrigger.refresh());
    };

    return () => {
      cancelled = true;
      detach();
      window.clearTimeout(giveUp);
      cleanup();
    };
  }, []);

  return null;
}
