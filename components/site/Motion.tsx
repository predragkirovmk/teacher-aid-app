"use client";

import { useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import { useGSAP } from "@gsap/react";
import Lenis from "lenis";
import { getLenis, setLenis } from "@/lib/site/lenis";

gsap.registerPlugin(ScrollTrigger, SplitText, useGSAP);

const pad = (n: number) => String(n).padStart(2, "0");

// Mixed decimals ("93,4", "0.6") keep their separator while counting.
function formatCount(value: number, decimals: number, sep: string, group: string) {
  const fixed = value.toFixed(decimals);
  const [int, frac] = fixed.split(".");
  const grouped = int.length > 3 && group ? int.replace(/\B(?=(\d{3})+(?!\d))/g, group) : int;
  return frac ? `${grouped}${sep}${frac}` : grouped;
}

/**
 * The page's whole motion layer. Everything is server-rendered and readable without it; this
 * adds Lenis, the scroll choreography and the pointer depth, and removes all of it under
 * prefers-reduced-motion, where the lesson becomes a stepper you click through.
 */
export function Motion({ children }: { children: React.ReactNode }) {
  const root = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const scope = root.current;
      if (!scope) return;
      const html = document.documentElement;
      (window as unknown as { __taMotion?: boolean }).__taMotion = true;
      const q = <T extends Element = HTMLElement>(sel: string, el: ParentNode = scope) =>
        Array.from(el.querySelectorAll<T & Element>(sel)) as unknown as T[];

      /* ---------- The lesson stepper: works with and without motion ---------- */
      const lesson = q<HTMLElement>("[data-lesson]")[0];
      const captions = lesson ? q<HTMLElement>("[data-step]", lesson) : [];
      const minutes = captions.map((c) => Number(c.dataset.minute ?? 0));
      const ices = captions.map((c) => c.dataset.ice === "true");
      let scrollToStep: ((i: number) => void) | null = null;

      const renderClock = (m: number) => {
        if (!lesson) return;
        const num = lesson.querySelector("[data-minute]");
        const arc = lesson.querySelector<SVGElement>("[data-ring-arc]");
        const knob = lesson.querySelector<SVGElement>("[data-ring-knob]");
        const p = Math.min(1, Math.max(0, m / 45));
        if (num) num.textContent = pad(Math.round(m));
        if (arc) arc.style.strokeDashoffset = String(1 - p);
        if (knob) gsap.set(knob, { rotation: p * 360, svgOrigin: "100 100" });
      };

      const markTick = (i: number) => {
        if (!lesson) return;
        q<HTMLElement>("[data-step-go]", lesson).forEach((b) => {
          const on = Number(b.dataset.stepGo) === i;
          b.classList.toggle("is-active", on);
          b.setAttribute("aria-pressed", String(on));
        });
      };

      const showStep = (i: number) => {
        if (!lesson) return;
        captions.forEach((c, k) => c.classList.toggle("is-active", k === i));
        q<HTMLElement>("[data-step-icon]", lesson).forEach((c, k) => c.classList.toggle("is-active", k === i));
        q<HTMLElement>(".phone__screen", lesson).forEach((c, k) => c.classList.toggle("is-active", k === i));
        lesson.classList.toggle("is-ice", ices[i]);
        markTick(i);
        renderClock(minutes[i]);
      };

      const onStepClick = (e: Event) => {
        const b = (e.target as HTMLElement).closest<HTMLElement>("[data-step-go]");
        if (!b) return;
        const i = Number(b.dataset.stepGo);
        if (scrollToStep) scrollToStep(i);
        else showStep(i);
      };
      lesson?.addEventListener("click", onStepClick);
      renderClock(minutes[0] ?? 0);

      /* ---------- Motion, only when the visitor has not asked for less ---------- */
      const mm = gsap.matchMedia();
      mm.add(
        {
          motion: "(prefers-reduced-motion: no-preference)",
          desktop: "(min-width: 960px)",
          fine: "(hover: hover) and (pointer: fine)",
        },
        (ctx) => {
          const { motion, desktop, fine } = ctx.conditions as Record<string, boolean>;
          if (!motion) {
            html.classList.remove("motion");
            return;
          }
          html.classList.add("motion");
          const R = desktop ? 1 : 0.5; // parallax depth; phones get half so it never feels seasick

          ScrollTrigger.config({ ignoreMobileResize: true });

          // Smooth scroll, driven by GSAP's ticker so ScrollTrigger and Lenis share one clock.
          const lenis = new Lenis({
            duration: 1.15,
            easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
          });
          setLenis(lenis);
          lenis.on("scroll", ScrollTrigger.update);
          const raf = (time: number) => lenis.raf(time * 1000);
          gsap.ticker.add(raf);
          gsap.ticker.lagSmoothing(0);

          const onAnchor = (e: MouseEvent) => {
            const a = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[href^="#"]');
            if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey) return;
            const id = a.getAttribute("href")!;
            const target = id === "#top" ? 0 : document.querySelector<HTMLElement>(id);
            if (target === null) return;
            e.preventDefault();
            lenis.start();
            lenis.scrollTo(target, { offset: id === "#top" ? 0 : -24, duration: 1.4 });
            if (target !== 0) window.setTimeout(() => target.focus({ preventScroll: true }), 900);
          };
          document.addEventListener("click", onAnchor);

          /* The moving field: its blooms drift on CSS, and rise slowly with the page. */
          gsap.to("[data-field-blooms]", {
            yPercent: -14,
            ease: "none",
            scrollTrigger: { start: 0, end: "max", scrub: true },
          });

          /* Nav picks up its glass once the page moves. */
          const nav = document.querySelector("[data-nav]");
          ScrollTrigger.create({
            start: 40,
            end: "max",
            onToggle: (self) => nav?.classList.toggle("is-scrolled", self.isActive),
          });

          /* ---------- Act 1 · hero ---------- */
          const hero = q<HTMLElement>("[data-hero]")[0];
          const heroTitle = q<HTMLElement>("[data-hero-title]")[0];
          const heroPhone = q<HTMLElement>(".hero__phone")[0];
          let pointerReady = false;

          if (heroPhone) gsap.set(heroPhone, { rotationY: -18, rotationX: 8, rotationZ: -4, transformPerspective: 1800 });

          if (heroTitle) {
            SplitText.create(heroTitle, {
              type: "lines,words",
              mask: "lines",
              linesClass: "split-line",
              wordsClass: "split-word",
              autoSplit: true,
              onSplit(self) {
                gsap.set(heroTitle, { opacity: 1 });
                return gsap.from(self.words, { yPercent: 120, duration: 1.4, ease: "expo.out", stagger: 0.07, delay: 0.1 });
              },
            });
          }

          const intro = gsap.timeline({ defaults: { ease: "expo.out" }, onComplete: () => (pointerReady = true) });
          intro
            .fromTo(q("[data-hero-intro]"), { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 1.3, stagger: 0.1 }, 0.45)
            .fromTo(
              q("[data-hero-phone]"),
              { opacity: 0, y: 200, rotationX: 30 },
              { opacity: 1, y: 0, rotationX: 0, duration: 2, transformPerspective: 1600 },
              0.2,
            )
            .fromTo(q("[data-hero-chip]"), { opacity: 0, y: 70, scale: 0.95 }, { opacity: 1, y: 0, scale: 1, duration: 1.5, stagger: 0.12 }, 0.75)
            .fromTo(q(".hero__icon--far"), { opacity: 0, scale: 0.9 }, { opacity: 1, scale: 1, duration: 2.2 }, 0.5);

          if (hero) {
            const heroScroll = { trigger: hero, start: "top top", end: "bottom top", scrub: true, invalidateOnRefresh: true };
            q<HTMLElement>("[data-hero-depth]").forEach((el) => {
              const d = parseFloat(el.dataset.heroDepth ?? "0");
              gsap.to(el, { y: () => -d * 150 * R, ease: "none", scrollTrigger: heroScroll });
            });
            if (heroPhone) gsap.to(heroPhone, { rotationY: 0, rotationX: 0, rotationZ: 0, scale: 0.9, ease: "none", scrollTrigger: heroScroll });
            if (heroTitle) gsap.to(heroTitle, { yPercent: -30, opacity: 0.2, ease: "none", scrollTrigger: heroScroll });
            gsap.to(q(".hero__copy"), { y: -120 * R, opacity: 0, ease: "none", scrollTrigger: { ...heroScroll, end: "70% top" } });
          }

          // Pointer depth: each layer follows the cursor by its own factor; the phone tilts.
          if (hero && fine && desktop) {
            const layers = q<HTMLElement>("[data-pointer]", hero).map((el) => ({
              f: parseFloat(el.dataset.pointer ?? "0"),
              x: gsap.quickTo(el, "x", { duration: 1.2, ease: "power3.out" }),
              y: gsap.quickTo(el, "y", { duration: 1.2, ease: "power3.out" }),
            }));
            const tilt = q<HTMLElement>("[data-hero-phone]", hero)[0];
            const rotY = tilt ? gsap.quickTo(tilt, "rotationY", { duration: 1.4, ease: "power3.out" }) : null;
            const rotX = tilt ? gsap.quickTo(tilt, "rotationX", { duration: 1.4, ease: "power3.out" }) : null;
            const onMove = (e: PointerEvent) => {
              if (!pointerReady) return;
              const nx = e.clientX / window.innerWidth - 0.5;
              const ny = e.clientY / window.innerHeight - 0.5;
              layers.forEach((l) => {
                l.x(nx * 70 * l.f);
                l.y(ny * 46 * l.f);
              });
              rotY?.(nx * 12);
              rotX?.(-ny * 9);
            };
            hero.addEventListener("pointermove", onMove);
            ctx.add(() => () => hero.removeEventListener("pointermove", onMove));
          }

          /* Magnetic calls to action: the button leans toward the cursor, the label further. */
          if (fine) {
            q<HTMLElement>("[data-magnetic]").forEach((btn) => {
              const label = btn.querySelector<HTMLElement>(".btn__label");
              const bx = gsap.quickTo(btn, "x", { duration: 0.7, ease: "power3.out" });
              const by = gsap.quickTo(btn, "y", { duration: 0.7, ease: "power3.out" });
              const lx = label ? gsap.quickTo(label, "x", { duration: 0.7, ease: "power3.out" }) : null;
              const ly = label ? gsap.quickTo(label, "y", { duration: 0.7, ease: "power3.out" }) : null;
              const move = (e: PointerEvent) => {
                const r = btn.getBoundingClientRect();
                const dx = e.clientX - (r.left + r.width / 2);
                const dy = e.clientY - (r.top + r.height / 2);
                bx(dx * 0.22);
                by(dy * 0.32);
                lx?.(dx * 0.12);
                ly?.(dy * 0.16);
              };
              const leave = () => {
                bx(0);
                by(0);
                lx?.(0);
                ly?.(0);
              };
              btn.addEventListener("pointermove", move);
              btn.addEventListener("pointerleave", leave);
              ctx.add(() => () => {
                btn.removeEventListener("pointermove", move);
                btn.removeEventListener("pointerleave", leave);
              });
            });
          }

          /* ---------- Shared vocabulary for every section ---------- */

          // Depth: every [data-depth] layer travels at its own speed through its section.
          q<HTMLElement>("[data-depth]").forEach((el) => {
            const d = parseFloat(el.dataset.depth ?? "0");
            const trigger = el.closest("section") ?? el;
            gsap.fromTo(
              el,
              { y: () => d * 80 * R },
              { y: () => -d * 80 * R, ease: "none", scrollTrigger: { trigger, start: "top bottom", end: "bottom top", scrub: true, invalidateOnRefresh: true } },
            );
          });

          // Drift: big lines of type slide sideways against each other.
          q<HTMLElement>("[data-drift]").forEach((el) => {
            const d = parseFloat(el.dataset.drift ?? "0");
            const trigger = el.closest("section") ?? el;
            gsap.fromTo(
              el,
              { x: () => d * 90 * R },
              { x: () => -d * 90 * R, ease: "none", scrollTrigger: { trigger, start: "top bottom", end: "bottom top", scrub: true, invalidateOnRefresh: true } },
            );
          });

          // Headlines rise line by line out of a mask.
          q<HTMLElement>("[data-split]").forEach((el) => {
            SplitText.create(el, {
              type: "lines",
              mask: "lines",
              linesClass: "split-line",
              autoSplit: true,
              onSplit(self) {
                gsap.set(el, { opacity: 1 });
                return gsap.from(self.lines, {
                  yPercent: 115,
                  duration: 1.3,
                  ease: "expo.out",
                  stagger: 0.1,
                  scrollTrigger: { trigger: el, start: "top 86%", once: true },
                });
              },
            });
          });

          // Copy settles in as it arrives.
          ScrollTrigger.batch(q("[data-reveal]"), {
            start: "top 90%",
            once: true,
            onEnter: (els) =>
              gsap.fromTo(els, { opacity: 0, y: 48 }, { opacity: 1, y: 0, duration: 1.2, ease: "expo.out", stagger: 0.09, overwrite: true }),
          });

          // The problem: words brighten as the reader reaches them.
          q<HTMLElement>("[data-scrub-words]").forEach((el) => {
            const split = SplitText.create(el, { type: "words", wordsClass: "scrub-word" });
            gsap.fromTo(
              split.words,
              { opacity: 0.14 },
              { opacity: 1, ease: "none", stagger: 0.12, scrollTrigger: { trigger: el, start: "top 88%", end: "bottom 52%", scrub: true } },
            );
          });

          /* ---------- Act 2 · the lesson, pinned ---------- */
          if (lesson) {
            const pin = lesson.querySelector<HTMLElement>("[data-lesson-pin]")!;
            const screens = q<HTMLElement>(".phone__screen", pin);
            const icons = q<HTMLElement>("[data-step-icon]", pin);
            const phone = pin.querySelector<HTMLElement>("[data-lesson-phone]");
            const ice = pin.querySelector<HTMLElement>("[data-lesson-ice]");
            const n = screens.length;
            const clock = { m: minutes[0] ?? 0 };

            gsap.set(screens, { autoAlpha: 0 });
            gsap.set(screens[0], { autoAlpha: 1 });
            gsap.set(captions, { opacity: 0, y: 40 });
            gsap.set(captions[0], { opacity: 1, y: 0 });
            gsap.set(icons, { autoAlpha: 0, scale: 0.9 });
            gsap.set(icons[0], { autoAlpha: 1, scale: 1 });
            if (phone) gsap.set(phone, { transformPerspective: 1600 });

            let active = 0;
            const tl = gsap.timeline({
              defaults: { ease: "power2.inOut" },
              scrollTrigger: {
                trigger: pin,
                start: "top top",
                end: () => `+=${Math.round(window.innerHeight * (0.72 * (n - 1) + 0.5))}`,
                pin: true,
                scrub: true,
                anticipatePin: 1,
                invalidateOnRefresh: true,
                onUpdate: () => {
                  const i = Math.min(n - 1, Math.max(0, Math.floor(tl.time() + 0.3)));
                  if (i !== active) {
                    active = i;
                    markTick(i);
                  }
                },
              },
            });

            for (let i = 1; i < n; i++) {
              const at = i - 0.6;
              tl.to(screens[i - 1], { autoAlpha: 0, scale: 0.94, yPercent: -3, duration: 0.45 }, at)
                .fromTo(screens[i], { autoAlpha: 0, scale: 1.05, yPercent: 3 }, { autoAlpha: 1, scale: 1, yPercent: 0, duration: 0.5 }, at + 0.1)
                .to(captions[i - 1], { opacity: 0, y: -44, duration: 0.4 }, at)
                .fromTo(captions[i], { opacity: 0, y: 56 }, { opacity: 1, y: 0, duration: 0.5 }, at + 0.1)
                .to(icons[i - 1], { autoAlpha: 0, scale: 0.8, y: -90 * R, duration: 0.5 }, at)
                .fromTo(icons[i], { autoAlpha: 0, scale: 1.2, y: 110 * R }, { autoAlpha: 1, scale: 1, y: 0, duration: 0.6 }, at)
                .to(clock, { m: minutes[i], duration: 0.6, ease: "power1.inOut", onUpdate: () => renderClock(clock.m) }, at);
              if (phone) {
                tl.to(
                  phone,
                  { rotationY: (i % 2 ? 8 : -8) * R, rotationZ: i % 2 ? 1.6 : -1.6, y: (i % 2 ? -18 : 18) * R, duration: 0.6, ease: "sine.inOut" },
                  at,
                );
              }
              // The signature moment: the field flips from midnight to ice with the result.
              if (ice && ices[i] !== ices[i - 1]) {
                const toIce = ices[i];
                tl.to(ice, { autoAlpha: toIce ? 1 : 0, duration: 0.55 }, at).to(
                  pin,
                  {
                    "--lesson-ink": toIce ? "#0b1b3f" : "#ffffff",
                    "--lesson-ink-2": toIce ? "rgba(11,27,63,0.72)" : "rgba(255,255,255,0.72)",
                    "--lesson-track": toIce ? "rgba(11,27,63,0.14)" : "rgba(255,255,255,0.12)",
                    "--lesson-inv": toIce ? "#ffffff" : "#0b1b3f",
                    duration: 0.55,
                  },
                  at,
                );
              }
            }
            tl.to({}, { duration: 0.4 }, n - 1);

            const st = tl.scrollTrigger!;
            scrollToStep = (i: number) => {
              const time = i === 0 ? 0 : i + 0.1;
              const y = st.start + (st.end - st.start) * (time / tl.duration());
              lenis.scrollTo(y, { duration: 1.3 });
            };
            ctx.add(() => () => {
              scrollToStep = null;
            });
          }

          /* ---------- Act 2 · the ice sheets arrive as cards and open to full bleed ---------- */
          q<HTMLElement>("[data-sheet]").forEach((sheet) => {
            gsap.fromTo(
              sheet,
              { clipPath: desktop ? "inset(10% 5% 0% 5% round 64px)" : "inset(5% 3% 0% 3% round 32px)" },
              {
                clipPath: "inset(0% 0% 0% 0% round 0px)",
                ease: "none",
                scrollTrigger: { trigger: sheet, start: "top bottom", end: "top 12%", scrub: true },
              },
            );
          });

          // +8 climbs to meet +10: a reasoned wrong answer is worth almost as much.
          const points = q<HTMLElement>("[data-why-point]");
          if (points.length === 2) {
            const box = points[0].parentElement!;
            gsap.fromTo(
              points[1],
              { y: 260 * R, opacity: 0.3 },
              { y: 0, opacity: 1, ease: "none", scrollTrigger: { trigger: box, start: "top 92%", end: "center 42%", scrub: true } },
            );
            gsap.fromTo(points[0], { y: -30 * R }, { y: 50 * R, ease: "none", scrollTrigger: { trigger: box, start: "top bottom", end: "bottom top", scrub: true } });
          }

          /* ---------- The teacher's five minutes ---------- */
          const input = q<HTMLElement>(".card--input")[0];
          if (input) {
            const lines = q<HTMLElement>("[data-type]", input).map((el) => SplitText.create(el, { type: "chars", charsClass: "type-char" }).chars);
            const typing = gsap.timeline({ scrollTrigger: { trigger: input, start: "top 78%", once: true } });
            lines.forEach((chars, i) => typing.fromTo(chars, { opacity: 0 }, { opacity: 1, duration: 0.01, stagger: 0.028, ease: "none" }, i ? ">+0.15" : 0));
          }
          ScrollTrigger.batch(q("[data-card]:not(.card--input)"), {
            start: "top 88%",
            once: true,
            onEnter: (els) =>
              gsap.fromTo(
                els,
                { opacity: 0, yPercent: 40, rotationX: -16, transformPerspective: 1000, transformOrigin: "50% 0%" },
                { opacity: 1, yPercent: 0, rotationX: 0, duration: 1.3, ease: "expo.out", stagger: 0.14 },
              ),
          });
          const seg = q<HTMLElement>("[data-seg]")[0];
          if (seg) {
            const options = q<HTMLElement>(".seg__option", seg);
            let on = 0;
            ScrollTrigger.create({
              trigger: seg.closest("section"),
              start: "top 55%",
              end: "bottom 45%",
              onUpdate: (self) => {
                const i = Math.min(options.length - 1, Math.floor(self.progress * options.length));
                if (i === on) return;
                on = i;
                options.forEach((o, k) => o.classList.toggle("is-on", k === i));
              },
            });
          }

          /* ---------- The headmaster's report: the month rises, older months fan out ---------- */
          const stack = q<HTMLElement>("[data-report]")[0];
          if (stack) {
            const range = { trigger: stack, start: "top bottom", end: "center 55%", scrub: true };
            gsap.fromTo(
              stack.querySelector("[data-report-current]"),
              { rotationX: 28, y: 180 * R, transformPerspective: 1800, transformOrigin: "50% 100%" },
              { rotationX: 0, y: 0, ease: "none", scrollTrigger: range },
            );
            gsap.fromTo(stack.querySelector("[data-report-prev]"), { rotation: 0, x: 0, y: 40 * R }, { rotation: -5, x: -52 * R, y: -30 * R, ease: "none", scrollTrigger: range });
            gsap.fromTo(stack.querySelector("[data-report-back]"), { rotation: 0, x: 0, y: 80 * R }, { rotation: -10, x: -104 * R, y: -58 * R, ease: "none", scrollTrigger: range });
          }

          /* ---------- Numbers count up once, in tabular figures ---------- */
          const countUp = (el: HTMLElement, target: number, decimals: number, sep: string, group: string) => {
            const w = el.getBoundingClientRect().width;
            el.style.minWidth = `${Math.ceil(w)}px`;
            const state = { v: 0 };
            el.textContent = formatCount(0, decimals, sep, group);
            ScrollTrigger.create({
              trigger: el,
              start: "top 88%",
              once: true,
              onEnter: () =>
                gsap.to(state, {
                  v: target,
                  duration: 1.8,
                  ease: "power3.out",
                  onUpdate: () => {
                    el.textContent = formatCount(state.v, decimals, sep, group);
                  },
                }),
            });
          };
          q<HTMLElement>("[data-count]").forEach((el) => {
            const lang = el.dataset.countLang;
            countUp(el, Number(el.dataset.count), 0, ".", lang === "mk" ? " " : ",");
          });
          q<HTMLElement>("[data-count-text]").forEach((el) => {
            const raw = el.textContent ?? "0";
            const sep = raw.includes(",") ? "," : ".";
            const [, frac = ""] = raw.split(sep);
            countUp(el, parseFloat(raw.replace(",", ".")), frac.length, sep, "");
          });

          /* ---------- Act 3 · the call to action gathers its light ---------- */
          const bloom = q<HTMLElement>("[data-contact-bloom]")[0];
          if (bloom) {
            gsap.fromTo(
              bloom,
              { scale: 0.55, opacity: 0.35 },
              { scale: 1.25, opacity: 1, ease: "none", scrollTrigger: { trigger: bloom.parentElement, start: "top bottom", end: "center center", scrub: true } },
            );
          }

          document.fonts?.ready.then(() => ScrollTrigger.refresh());

          return () => {
            document.removeEventListener("click", onAnchor);
            gsap.ticker.remove(raf);
            lenis.destroy();
            setLenis(null);
          };
        },
      );

      return () => {
        lesson?.removeEventListener("click", onStepClick);
        mm.revert();
        getLenis()?.destroy();
        setLenis(null);
      };
    },
    { scope: root },
  );

  return (
    <div ref={root} className="site">
      {children}
    </div>
  );
}
