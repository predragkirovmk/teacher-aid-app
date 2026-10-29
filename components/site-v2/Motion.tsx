"use client";

import { useEffect } from "react";
import { CLASS_SIZE } from "@/lib/site-v2/classroom";
import { setLenis } from "@/lib/site-v2/lenis";

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
 * The page's motion layer. The page is complete without it; this arrives after first paint
 * (GSAP, ScrollTrigger and Lenis are fetched only now, so they never hold up the hero) and adds
 * the scroll reveals. Nothing runs under prefers-reduced-motion.
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

    let cleanup = () => {};
    let cancelled = false;

    Promise.all([import("gsap"), import("gsap/ScrollTrigger"), import("lenis")]).then(
      ([{ gsap }, { ScrollTrigger }, { default: Lenis }]) => {
        if (cancelled) return;
        gsap.registerPlugin(ScrollTrigger);
        (window as unknown as { __taMotion?: boolean }).__taMotion = true;
        html.classList.add("motion");
        ScrollTrigger.config({ ignoreMobileResize: true });

        const mm = gsap.matchMedia();
        mm.add(
          { fine: "(hover: hover) and (pointer: fine)", narrow: "(max-width: 767px)" },
          (ctx) => {
            const { fine, narrow } = ctx.conditions as Record<string, boolean>;

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
              lenis.scrollTo(target, { offset: 0, duration: 1.3 });
              window.setTimeout(() => target.focus({ preventScroll: true }), 900);
            };
            document.addEventListener("click", onAnchor);

            /* The hero (act 1): pinned for two screens of scroll. The text clears and the stage
               rises, the headline settles as the scene's caption, the laptop settles on the desk and
               the student's phone moves to the front of the stack beside it. The other 28 phones of the class
               are dealt up behind it, then answer: their edges light yellow in a wave from the
               front to the back while the count climbs to 29. Only a few layers move at once.
               Both layouts are CSS (the start is the page, the end is .hero__end), measured here
               on every refresh. */
            const hero = document.querySelector<HTMLElement>("[data-hero]");
            const q = <T extends Element>(sel: string) => Array.from(hero?.querySelectorAll<T>(sel) ?? []);
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

            if (hero && title && titleEnd && stage && laptop && phone && front && desk && cards.length && num) {
              // The entrance runs in CSS; once it has played (or the first scroll cuts it short) it is
              // cancelled, so its fill never overrides the scene. Its end state is the base style.
              const entrance = hero.getAnimations({ subtree: true });
              const settle = () => {
                entrance.forEach((a) => a.cancel());
                hero.classList.add("is-entered");
              };
              Promise.all(entrance.map((a) => a.finished.catch(() => {}))).then(settle);

              // First the stage rises so the laptop shows itself, its top just under the headline
              // (lower on wide screens, where the headline is taller); the phone then travels from
              // there, so their moves subtract the rise.
              const rise = () => Math.min(0, hero.offsetHeight * (narrow ? 0.42 : 0.58) - box(stage, hero).y);
              const flip = (el: HTMLElement, to: HTMLElement, origin: "top" | "center") => {
                const a = box(el, hero);
                const b = box(to, hero);
                const scale = b.w / a.w;
                const dy = origin === "top" ? b.y - a.y : b.y + b.h / 2 - (a.y + a.h / 2);
                return { x: b.x + b.w / 2 - (a.x + a.w / 2), y: dy - rise(), scale };
              };
              const titleTo = () => {
                const a = box(title, hero);
                const b = box(titleEnd, hero);
                const scale = parseFloat(getComputedStyle(titleEnd).fontSize) / parseFloat(getComputedStyle(title).fontSize);
                return { x: b.x - a.x, y: b.y - a.y, scale };
              };
              // GSAP re-reads function values on every refresh, so the scene follows any resize.
              const toward = (m: () => { x: number; y: number; scale: number }) => ({
                x: () => m().x,
                y: () => m().y,
                scale: () => m().scale,
              });
              // Each card behind the front sits one step higher and a little narrower.
              const step = () => front.offsetWidth * 0.03;
              gsap.set(cards, { transformOrigin: "50% 0%", scale: (i) => 1 - (i + 1) * 0.008 });
              const count = { n: 1 };

              heroTl = gsap.timeline({
                defaults: { ease: "none" },
                scrollTrigger: {
                  trigger: hero,
                  start: "top top",
                  end: "+=200%",
                  pin: true,
                  scrub: fine ? 0.6 : 0.35,
                  invalidateOnRefresh: true,
                  onUpdate: (st) => {
                    if (st.progress > 0 && !hero.classList.contains("is-entered")) settle();
                  },
                },
              });

              heroTl
                // From explicit values: the CSS entrance may still be mid-way when this is built.
                .fromTo("[data-hero-out]", { y: 0, autoAlpha: 1 }, { y: -48, autoAlpha: 0, duration: 1.2 }, 0)
                .fromTo(stage, { x: 0, y: 0, scale: 1 }, { y: rise, duration: 1.6, ease: "power2.out" }, 0)
                .to(title, { ...toward(titleTo), transformOrigin: "0 0", duration: 2.8, ease: "power2.inOut" }, 0.2)
                // The teacher's laptop settles on the desk; the student's phone goes to the class.
                .to(laptop, { ...toward(() => flip(laptop, desk, "top")), transformOrigin: "50% 0%", duration: 2.2, ease: "power2.inOut" }, 1.6)
                .to(phone, { ...toward(() => flip(phone, front, "center")), duration: 2.2, ease: "power3.inOut" }, 1.8)
                .to("[data-stack]", { autoAlpha: 1, duration: 0.01 }, 3.6)
                // The class is dealt up behind the front phone, nearest first.
                .fromTo(cards, { y: 0 }, { y: (i) => -(i + 1) * step(), duration: 0.6, ease: "power2.out", stagger: { amount: 1.6 } }, 3.6)
                .to("[data-hero-count]", { autoAlpha: 1, duration: 0.6 }, 4.8)
                // Then they answer, front to back, and the count keeps pace.
                .to("[data-lit]", { opacity: 1, duration: 0.3, stagger: { amount: 3.4, ease: "sine.inOut" } }, 5.4)
                .to(count, { n: CLASS_SIZE, duration: 3.7, onUpdate: () => (num.textContent = String(Math.round(count.n))) }, 5.4)
                .to({}, { duration: 1 });
            }

            // A number that counts while a timeline plays, written into each of `els`. The play-once
            // timelines below set their start states first and then only tween to the end.
            const counter = (tl: ReturnType<typeof gsap.timeline>, els: (Element | null)[], from: number, to: number, duration: number, at: number | string) => {
              const o = { n: from };
              const write = () => els.forEach((e) => e && (e.textContent = String(Math.round(o.n))));
              write();
              tl.to(o, { n: to, duration, ease: "none", onUpdate: write }, at);
            };

            /* The teacher chapter opens: the laptop grows as it comes up the screen until it fills
               it, one layer scaling with the scroll. */
            const openerLaptop = document.querySelector<HTMLElement>(".opener__laptop");
            if (openerLaptop) {
              gsap.fromTo(
                openerLaptop,
                { scale: 0.76, y: 40 },
                {
                  scale: 1,
                  y: 0,
                  ease: "none",
                  scrollTrigger: { trigger: openerLaptop, start: "top bottom", end: "center center", scrub: fine ? 0.6 : 0.35 },
                },
              );
            }

            /* Prepare (act 2): once the laptop is in view, the lesson file and the line of emphasis
               arrive, the AI writes, the questions appear, and one tap on Harder rewrites them. */
            const prep = document.querySelector<HTMLElement>("[data-prep]");
            if (prep) {
              const P = (sel: string) => Array.from(prep.querySelectorAll<HTMLElement>(sel));
              const pick = P('[data-prep-refine="pick"]');
              const qs = P("[data-prep-q]");
              gsap.set([...P("[data-prep-file]"), ...P("[data-prep-emph]")], { y: 14, autoAlpha: 0 });
              gsap.set([...P("[data-prep-writing]"), ...P("[data-prep-count]")], { autoAlpha: 0 });
              gsap.set(P("[data-prep-bar]"), { scaleX: 0 });
              gsap.set(qs, { y: 10, autoAlpha: 0 });
              const tl = gsap.timeline({ paused: true, defaults: { ease: "power3.out" } });
              tl.to(P("[data-prep-file]"), { y: 0, autoAlpha: 1, duration: 0.6 })
                .to(P("[data-prep-emph]"), { y: 0, autoAlpha: 1, duration: 0.6 }, "-=0.35")
                .to(P("[data-prep-writing]"), { autoAlpha: 1, duration: 0.3 })
                .to(P("[data-prep-bar]"), { scaleX: 1, duration: 1.4, ease: "power1.inOut" })
                .to(P("[data-prep-writing]"), { autoAlpha: 0, duration: 0.25 })
                .to(P("[data-prep-count]"), { autoAlpha: 1, duration: 0.3 })
                .to(qs, { y: 0, autoAlpha: 1, duration: 0.5, stagger: 0.12 }, "-=0.1")
                .to(pick, { backgroundColor: "#ffc83e", color: "#0a2e37", duration: 0.2 }, "+=0.5")
                .to(qs, { autoAlpha: 0.35, duration: 0.2, stagger: 0.04 }, "+=0.1")
                .to(qs, { autoAlpha: 1, duration: 0.35, stagger: 0.06 })
                .to(pick, { backgroundColor: "rgba(255, 200, 62, 0)", color: "#f6f9f9", duration: 0.3, clearProps: "backgroundColor,color" }, "+=0.2");
              ScrollTrigger.create({ trigger: prep, start: "top 75%", once: true, onEnter: () => void tl.play() });
            }

            /* In class (act 2, climax): the stage pins for three screens of scroll and plays one
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
              const fromRow = () => {
                const a = box(row, liveStage);
                const b = box(boardQ, liveStage);
                const scale = a.w / b.w;
                return { x: a.x - b.x, y: a.y + (a.h - b.h * scale) / 2 - b.y, scale };
              };

              gsap.set(steps, { autoAlpha: (i) => (i === 0 ? 1 : 0) });
              gsap.set(L("[data-board-lobby]"), { autoAlpha: 1 });
              gsap.set(L("[data-board-q]"), { autoAlpha: 0 });
              gsap.set(L("[data-send-label]"), { opacity: 1 });
              gsap.set(L("[data-sent-label]"), { opacity: 0 });
              gsap.set(fills, { scaleX: 0 });
              gsap.set([...LA("[data-bar-pct]"), L("[data-ring]"), L("[data-reveal-fill]")], { opacity: 0 });

              const tl = gsap.timeline({
                defaults: { ease: "none" },
                scrollTrigger: {
                  trigger: live,
                  start: "center center",
                  end: "+=300%",
                  pin: true,
                  // ScrollTrigger leaves spacing off for a flex child; the stage sits in one.
                  pinSpacing: true,
                  scrub: fine ? 0.6 : 0.35,
                  invalidateOnRefresh: true,
                },
              });
              const beat = (i: number, at: number) =>
                tl
                  .to(steps[i - 1], { autoAlpha: 0, y: -10, duration: 0.22 }, at)
                  .fromTo(steps[i], { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: 0.35 }, at + 0.26);

              // 1. Students scan in.
              counter(tl, [L("[data-joined]"), L("[data-c-joined]")], 0, 27, 1.8, 0.2);
              // 2. Send: the button presses, the question leaves the laptop for the board.
              beat(1, 2.1);
              tl.to(send, { scale: 0.92, duration: 0.12 }, 2.3)
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
              tl.to(revealBtn, { scale: 0.92, duration: 0.12 }, 6.9)
                .to(revealBtn, { scale: 1, duration: 0.2 }, 7.02)
                .to(L("[data-reveal-fill]"), { opacity: 1, duration: 0.2 }, 6.95)
                .to(L("[data-ring]"), { opacity: 1, duration: 0.35 }, 7.1)
                .to(bars.filter((b) => !b.classList.contains("is-right")), { opacity: 0.55, duration: 0.35 }, 7.1)
                .to(LA("[data-bar-pct]"), { opacity: 1, duration: 0.35 }, 7.1)
                .to({}, { duration: 1.6 });
            }

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
              ScrollTrigger.create({ trigger: end, start: "top 75%", once: true, onEnter: () => void tl.play() });
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
              ScrollTrigger.create({ trigger: results, start: "top 75%", once: true, onEnter: () => void tl.play() });
            }

            // Reveals: each block rises into place as it enters, in reading order, once.
            const rise = narrow ? 28 : 44;
            gsap.set("[data-reveal]", { y: rise, autoAlpha: 0 });
            const batch = ScrollTrigger.batch("[data-reveal]", {
              start: "top 86%",
              once: true,
              onEnter: (els) =>
                gsap.to(els, {
                  y: 0,
                  autoAlpha: 1,
                  duration: narrow ? 0.8 : 1,
                  ease: "power3.out",
                  stagger: narrow ? 0.06 : 0.08,
                  overwrite: true,
                  clearProps: "transform",
                }),
            });

            // Web fonts change the headline's measure: measure the scene again once they are in.
            document.fonts.ready.then(() => ScrollTrigger.refresh());

            return () => {
              if (placeCard) ScrollTrigger.removeEventListener("refreshInit", placeCard);
              heroTl?.scrollTrigger?.kill();
              heroTl?.kill();
              document.removeEventListener("click", onAnchor);
              batch.forEach((st) => st.kill());
              if (lenis) {
                gsap.ticker.remove(raf);
                lenis.destroy();
                setLenis(null);
              }
            };
          },
        );

        cleanup = () => mm.revert();
      },
    );

    return () => {
      cancelled = true;
      cleanup();
    };
  }, []);

  return null;
}
