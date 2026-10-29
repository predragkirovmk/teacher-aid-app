# TeacherAid website v2: design brief

Started 2026-10-29. A brand-new marketing site that replaces the old one (`app/(mk)`, `app/(en)`,
`components/site/`). The old site is never edited; v2 is built beside it at `/v2` and `/v2/en`
and swapped onto `/` only when the owner says so.

## Owner decisions (2026-10-29, do not re-ask)

- Keep from the old site: the boldness, huge type, bold effects, the premium Apple feel, smooth
  scroll-triggered motion. Everything else is new.
- Direction: `modern-frontend` cinematic-scroll, nothing blended in.
- Colour: a light Apple-style ground. The teacher chapter turns deep teal (the teacher app's
  colours); the student chapter, built later, turns blue and yellow (the student app's).
- One long page: hero, teacher chapter, student chapter (later), trust, booking, footer.
- Phones get the same choreography as desktop. Smoothness is an engineering job, not a cut.
- Signature moment: the laptop and the projected class view in sync. A question leaves the
  laptop, lands on the board, the answer bars fill, the answer is revealed.
- Fresh copy from the teacher app plan and the backend spec, not the old site's text. Macedonian
  first, English second. Polite form ("Вие").
- Audience: school directors (deans at a university) and teachers. Main action:
  "Закажете бесплатен час".
- Screens inside the devices are placeholders until the apps are finished.

## Design context

### Users
School directors and teachers in North Macedonia, secondary schools first, universities too.
Many are over fifty and not at ease with technology. Most first see the site in person, walked
through on a phone or a laptop by someone from TeacherAid, or from a link sent after a visit.
Jobs: understand in one minute what TeacherAid does in a real lesson, believe it is simple
enough for their teachers, and book a free lesson.

### Brand voice
Assured, plainspoken, bright. A good head of department explaining something they are proud
of: no hype, no jargon, short sentences, real facts. Physical reference: the signage of a
well-run public building, set by a designer who cared.

### Aesthetic direction
- Light first. The ground is a paper white tinted towards the teacher teal; text is a teal-black
  ink. The teacher chapter is the one deep-teal moment, entered with a theme morph.
- Type does the heavy lifting: enormous Cyrillic display lines, plain body, almost no boxes.
- The product is the protagonist: a laptop and a classroom board, drawn in the page (not
  photos), with the teacher app's real layout as the placeholder screen.
- Anti-references: the old site's navy glow, glass on everything, gradient text, purple or cyan
  AI palettes, Kahoot carnival, school-portal clutter, three equal feature cards.

### Principles
1. **One idea per scene.** Each viewport says one thing in one line of display type.
2. **Show the lesson, not features.** Every scene maps to a moment of a real 45-minute period.
3. **Plain words, big type.** Body 18px or larger; no jargon ("лекција", "час", not "сесија").
4. **Honest data.** No invented statistics. Numbers in screens are labelled as examples.
5. **Smooth on a cheap phone or it does not ship.**

## Materials

### Type
- Display: **Geologica** (variable, weight 700 to 900), Cyrillic native, sturdy, slightly sharp.
  Hero `clamp(3.25rem, 11.5vw, 12.5rem)`, leading 0.92, tracking -0.045em. Chapter lines
  `clamp(2.6rem, 7vw, 7.25rem)`. Never italic (no Macedonian italic forms needed).
- Body: **Golos Text** (the apps' font), 400 to 600. Body 1.125rem, lead
  `clamp(1.25rem, 1.55vw, 1.6rem)`, meta 1rem. Measure 34 to 62ch.
- Cyrillic sets 20 to 30 % wider than Latin: display lines are written short and balanced
  (`text-wrap: balance`), never hyphenated.

### Colour (OKLCH, neutrals tinted to the teal hue)
| Token | Value | Use |
|---|---|---|
| `--paper` | `oklch(98.6% 0.004 200)` | Page ground |
| `--paper-2` | `oklch(95.8% 0.008 205)` | Quiet bands, device desk |
| `--ink` | `oklch(23% 0.035 220)` | Text on paper |
| `--ink-2` | `oklch(44% 0.025 220)` | Secondary text on paper (7:1) |
| `--line` | `oklch(88% 0.01 205)` | Hairlines |
| `--deep` `#124554`, `--panel` `#145667`, `--ground-top` `#155869`, `--ground` `#32878C`, `--shadow` `#0A2E37` | teacher app | The teacher chapter |
| `--yellow` `#FFC83E`, `--yellow-deep` `#CEA034` | teacher app | The live moment; the main button on teal |
| `--on-teal-2` | `oklch(86% 0.03 200)` | Secondary text on teal |

Main button: deep teal fill with paper text on the light ground; yellow fill with ink text on
teal. One main button per viewport. Secondary actions are chevron links ("Погледнете како
работи ›"). Red is not used on the site.

### Layout
- 12-column grid, `max-width: 1440px`, gutter `clamp(1rem, 4vw, 4rem)`.
- Asymmetric: display lines start at column 1 and run to 11; supporting copy sits in 7 to 11.
- Scene padding `clamp(6rem, 14vh, 11rem)`; scenes are at least one viewport tall when pinned.
- Below 768px everything collapses to one column with a 20px gutter; nothing scrolls sideways.

### Devices (drawn in HTML and CSS, no images)
- **Laptop**: aluminium-tinted lid and base, 16:10 screen. Holds the teacher console.
- **Board**: a wall screen, thin dark frame, 16:9. Holds the projected class view.
- **Phone**: rounded body with an island, 9:19.5. Holds the student app (student chapter).
- Placeholder screens follow the real app layouts (teacher: teal sidebar with four items) and
  carry a small "Пример" label.

## Motion

- Engine: GSAP + ScrollTrigger, loaded after first paint. Lenis on desktop pointers only;
  touch keeps native scrolling (smoothing touch adds latency, it does not add smoothness).
- Hero entrance runs in CSS so it starts at first paint without waiting for JavaScript; it is
  cancelled once played (or at the first scroll), so its fill never overrides the scene.
- Pinned scenes keep both layouts in CSS (start in the flow, end in an absolutely placed layer)
  and the motion layer only measures between them, so a resize just re-measures.
- Scroll scenes: pinned, scrubbed timelines with `scrub: 0.6` on desktop and `scrub: 0.35` on
  touch. Two pins only: the hero and In class. A pinned element inside a flex container needs
  `pinSpacing: true` set by hand.
- Play-once scenes set their start states with `gsap.set` and tween only to the end: a paused
  timeline does not apply `from()` or `fromTo()` starts reliably.
- Easing: `power3.out` / `expo.out` for entrances, `none` inside scrubs. No bounce.
- Reduced Motion: no movement, no pinning; scenes show their end state; fades stay.

## Performance rules (every step, phones included)

- Animate only `transform` and `opacity`. No `filter`, no `backdrop-filter`, no animated
  `box-shadow`, no `clip-path` scrubs (they repaint every frame). Image reveals use an
  overflow mask plus two opposing translates.
- No blur anywhere on the page. The nav is a solid colour.
- Static shadows only, on elements that do not change size.
- No WebGL, no canvas, no video on the page until the real screens arrive.
- Fonts: two families, Latin and Cyrillic subsets, self-hosted by `next/font`.
- `will-change` only on layers that are moving right now; ScrollTrigger handles it.
- Budget: the page's own first-load code under 20 KB gzip on top of Next and React (about
  160 KB together in Next 16; the first site shipped 226 KB); GSAP, ScrollTrigger and Lenis
  arrive after first paint. Under a 4x CPU throttle on a 390px viewport, a full touch scroll keeps
  95 % of frames under 20 ms (`node scripts/site-v2-perf.mjs <url>`).
- Owner check on a real phone with each preview.
- Measured after step 4 (30 Oct 2026, 390px phone, 4x slower CPU, production preview):
  - Frames: 100 % under 20 ms through both pinned scenes, no long tasks.
  - The same 6,000px touch scroll, new site against the first one: raster 246 ms against 625 ms,
    script 162 ms against 424 ms, style 55 ms against 266 ms, paint 79 ms against 121 ms.
  - Slow 4G load: first paint 0.9 s, main content 1.5 s, layout shift 0.
  - Weight: first-load JS 174 KB gzip (Next and React are about 160 of it), motion 45 KB after
    first paint, CSS 8 KB, fonts 99 KB (two families, Latin and Cyrillic).

## Chapters

| Act | Scene | Theme |
|---|---|---|
| Hook | Hero: the whole class answers. Pinned for two screens: the text clears, the headline becomes the caption, the laptop settles on the desk, the student's phone moves to the front of a stack of the class's 28 other phones beside it, and their edges light yellow front to back as the count reaches 29 | Paper |
| Build | Teacher chapter opener: ready before the bell | Morph to teal |
| Build | Prepare: plays once on arrival. The file and the line of emphasis land, the AI writes, the questions appear, one tap on Harder rewrites them | Teal |
| Climax | In class: pinned for three screens. Students join (0 to 27), Send is pressed, the question flies from the laptop to the board, answers and the timer count, the bars fill, the right answer is revealed. One caption per beat | Teal |
| Build | After class: plays once. Present, late and absent count in; the most-missed questions fill | Teal to paper |
| Build | Class results: plays once. Attendance bars grow, topics and anonymous questions arrive | Paper |
| Later | Student chapter (phone) | Blue and yellow |
| Later | Trust: data, privacy, the director's monthly report | Paper |
| Epilogue | Book a free lesson, footer | Paper |

## Steps

1. Base (this step): worktree, this brief, tokens, fonts, nav with chapter theme, MK/EN,
   device frames with placeholder screens, scene skeletons, perf harness.
2. Hero.
3. Teacher chapter scenes and the signature sync.
4. Motion polish (apple-design-motion, emil-design-eng), gsap-performance pass.
5. Gate: phone perf, bolder, review-animations, accessibility, text-hygiene, preview.
6. Later: student chapter, trust, booking, swap to `/`.

## Code layout

- Routes: `app/(v2-mk)/v2/page.tsx` and `app/(v2-en)/v2/en/page.tsx`, each group with its own
  root layout (the `lang` attribute differs). Both are `noindex` until the swap.
- Components in `components/site-v2/`, copy in `content/site-v2/` (MK and EN dictionaries with a
  shared type), styles in `app/site-v2.css`, logic in `lib/site-v2/`.
- Shared brand code (`lib/brand.ts`, `components/app/Mark.tsx`) is imported, never changed.
  Nothing under the old site, `/app` or `/teacher` is modified.
