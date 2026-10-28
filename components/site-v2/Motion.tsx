"use client";

import { useEffect } from "react";
import { setLenis } from "@/lib/site-v2/lenis";

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

            return () => {
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
