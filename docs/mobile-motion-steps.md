# Student app motion: the steps

The owner wants the whole student phone app (`/app`) to have "exaggerated animations that feel good
to use", with no loss of speed on a mid-range Android phone. Students stay blue and yellow. This
file is the plan, the record of each step and the list of files each step may touch. A file not
listed here is not touched without asking the owner first.

Branch `animate-ui`, cut from `origin/main` at d85fa4e. One draft pull request. Never `main`.

## The rules every step is judged by

- Springs with overshoot, never plain easing curves.
- Anticipation and follow-through: a dip before a pop, secondary parts lag a few milliseconds.
- Squash and stretch on every tappable element: about 0.94 on touch-down, back past 1 on release.
- Lists rise calmly (8 px, a fade, 35 ms apart, no scale); answer options stagger 30 to 50 ms apart with a small pop (step 4, the owner chose calm on 2026-11-17).
- Interruptible: a second tap mid-animation reverses from where it is, never restarts. In CSS this
  means press feedback is a transition, not a keyframe animation.
- The exaggeration budget (below): frequent things get a small bounce, rare moments the big one.
- Big motion settles in about 400 to 600 ms. Nothing feels slow.
- Only transform and opacity animate. No width, height, top, left, box-shadow or filter in an
  animation or a loop. `will-change` only while something animates, never in a resting rule.
- `prefers-reduced-motion: reduce` turns every bounce and burst into a short plain fade, on every
  screen.
- Haptics are a bonus: `navigator.vibrate`, feature-detected, short pulses on rewards only.
- A recorded answer is never lost and the quiz timing never changes because of an animation.
  Motion never blocks input and never delays the countdown. The view transition overlay lets
  taps through (`::view-transition { pointer-events: none }`).
- Copy stays as it is, in Macedonian and English. No emojis anywhere.

## Architecture (decided by the owner)

1. CSS is the base layer: press feedback, entrances, stagger, rewards that need no JS.
2. Motion (`motion` package) only where CSS cannot reach: drag with velocity handoff, layout and
   exit. Never the full `motion` component, never Animate UI components. Step 6 found nothing that
   needed it: the house spring carries a starting velocity (`sampleThrow`, `throwTo` in
   `lib/app/motion.ts`), so the app depends on neither `motion` nor `@animate-ui/react`.
3. Screen changes use the View Transitions API through React's `<ViewTransition>` (Next 16 App
   Router, no config; see `node_modules/next/dist/docs/01-app/02-guides/view-transitions.md`).
   Browsers without it change screens at once. No polyfill, no shim.
4. No GSAP or Lenis in the student app.
5. One token system: the springs live once, in `lib/app/motion.ts`, as SwiftUI-style
   `{ duration, bounce }`. The CSS `linear()` curves in `app/(app)/app.css` are sampled from those
   values, and Motion springs take `stiffness` and `damping` derived from the same values
   (`stiffness = (2 pi / duration)^2`, `damping = 4 pi (1 - bounce) / duration`, mass 1). A unit
   test fails if the CSS and the values drift apart.

### The springs

| Token | duration / bounce | Overshoot | Use |
|---|---|---|---|
| `--spring-press` | 0.15 / 0 (was 0.25 / 0) | none | touch-down, so a press answers within a frame or two (exists, quickened) |
| `--spring-pop` | 0.2 / 0.6 | 24.8% (settles in 480 ms) | release past 1 after a press, small arrivals (new). A press travels only 0.04 to 0.06, so a 12% overshoot (1.007) could not be seen; 25% reaches about 1.015 |
| `--spring-snappy` | 0.3 / 0.15 | small | small state changes (exists) |
| `--spring-smooth` | 0.4 / 0 | none | sheets, morphs, screen moves (exists) |
| `--spring-bouncy` | 0.5 / 0.3 | about 5% | medium arrivals (exists) |
| `--spring-big` | about 0.32 / 0.5 | about 16% | the big moment only (new) |

Each has a `-dur` variable: the settle time, by the same rule the existing four were sampled with
(points equally spaced over `-dur`, cut where the curve stays within a fraction of a percent of
1). `--spring-big-dur` stays at or under about 620 ms, `--spring-pop-dur` under about 500 ms (its
visible part is over far sooner: the travel is a few percent).
Step 1 fits the exact values. The old 100 ms `cubic-bezier` press-in is replaced by
`--spring-press`: no plain easing curves.

### The exaggeration budget

| Tier | When | What it gets |
|---|---|---|
| Small | every tap, tab change, screen change, list arrival, sheet | squash 0.94 then `--spring-pop`; screen moves on `--spring-smooth`; a list or card rises 8 px with a fade, 35 ms apart, no scale; answer options pop from 0.96, 30 to 50 ms apart; a sheet rises on `--spring-snappy` |
| Big | a right answer, points landing, a new badge, the end of a lesson, a finished practice set | `--spring-big`, burst, rolling counter, ring pulse, confetti, a short vibration |

A wrong answer is not a reward: it gets a clear but small reaction (a dip and settle), never a
punishment shake. Nothing else gets big motion. If a step wants to make something else loud, it
asks first.

### Motion size budget

The total JS this work adds to the student app stays under about 20 KB gzipped, measured by
`tests/capture/student-screens.mjs` (`js-size.json`: every script the student screens load).

A probe before the work (rolldown, minified, gzip -9, React external, motion 14.14.0) put
`LazyMotion` + `m` at about 5 KB, with `domAnimation` at about 31 KB and with `domMax` (drag and
layout) at about 46 KB, against about 5 KB for `animate` from `motion/mini` with Motion's `spring`
generator. So step 6 measures the real build first. If `LazyMotion` + `m` with the features it
needs fits the budget, it is used as the owner decided. If it does not, step 6 keeps the app's
own drag handling (the pager and the sheet already track velocity) and hands the release velocity
to Motion's `spring` through `motion/mini`, and does exits and layout moves with React's
`<ViewTransition>` and CSS `@starting-style`, which cost nothing. The step records the numbers.

## The student screens

Every screen and state, in flow order, with the file that renders it. The capture script
`tests/capture/student-screens.mjs` takes one picture of each at 390 x 844.

The tab bar on every signed-in screen with tabs is the classic five slots: Home, Subjects, the raised scan
(an action, not a section), Alerts, Profile (`components/app/Shell.tsx`, `SegGlide.tsx`). Subjects is a tab root
with a large title and no Back, so `09-subjects` is the Subjects tab; it joins `TAB_ORDER` in the pager, which now
has four sections. Home no longer lists the subjects, so no state is reached through it: `10-subject-detail` is
opened by address, and `student-perf.mjs` opens a subject from the Subjects tab. Numbering is unchanged.

| Picture | Route | Rendered by |
|---|---|---|
| 01-splash | `/app` | `components/app/SessionScreens.tsx (Splash)` |
| 02-welcome | `/app/welcome` | `app/(app)/app/welcome/page.tsx`, `components/app/SignIn.tsx` |
| 03-welcome-provider-sheet | `/app/welcome` | `components/app/DemoProviderSheet.tsx` |
| 04-welcome-error | `/app/welcome?error=sign_in_failed` | `app/(app)/app/welcome/page.tsx`, `components/app/SignIn.tsx` |
| 05-notice-first | `/app` | `components/app/NoticeScreen.tsx` |
| 06-notice-updated | `/app` | `components/app/NoticeScreen.tsx` |
| 07-home | `/app` | `app/(app)/app/page.tsx` |
| 08-home-clock-sheet | `/app` | `components/app/ClockOptions.tsx via components/app/Shell.tsx` |
| 09-subjects | `/app/subjects` | `app/(app)/app/subjects/page.tsx` |
| 10-subject-detail | `/app/subject/math` | `app/(app)/app/subject/[id]/page.tsx` |
| 11-schedule | `/app/schedule` | `app/(app)/app/schedule/page.tsx` |
| 12-attendance | `/app/attendance` | `app/(app)/app/attendance/page.tsx` |
| 13-achievements | `/app/achievements` | `app/(app)/app/achievements/page.tsx` |
| 14-leaderboard | `/app/leaderboard` | `app/(app)/app/leaderboard/page.tsx` |
| 15-summary-list | `/app/summary` | `app/(app)/app/summary/page.tsx` |
| 16-summary-detail | `/app/summary/mock-session-math` | `app/(app)/app/summary/[id]/page.tsx`, `components/app/Summary.tsx` |
| 17-scan | `/app/scan` | `app/(app)/app/scan/page.tsx` |
| 18-qr-kit | `/app/qr-kit` | `app/(app)/app/qr-kit/page.tsx` |
| 19-quiz-connecting | `/app/checkin/MATH-7B` | `components/app/quiz/Play.tsx` |
| 20-quiz-lobby | `/app/play/MATH-7B` | `components/app/quiz/Play.tsx` |
| 21-quiz-question-choice | `/app/play/MATH-7B` | `components/app/quiz/Play.tsx`, `components/app/quiz/choices.tsx` |
| 22-quiz-question-picked | `/app/play/MATH-7B` | `components/app/quiz/Play.tsx` |
| 23-quiz-right | `/app/play/MATH-7B` | `components/app/quiz/Play.tsx` |
| 24-quiz-wrong | `/app/play/MATH-7B` | `components/app/quiz/Play.tsx` |
| 25-quiz-between | `/app/play/MATH-7B` | `components/app/quiz/Play.tsx` |
| 26-quiz-ended | `/app/play/MATH-7B` | `components/app/quiz/Play.tsx`, `components/app/Results.tsx` |
| 27-quiz-true-false | `/app/play/MATH-7B` | `components/app/quiz/Play.tsx`, `components/app/quiz/choices.tsx` |
| 28-quiz-numeric | `/app/play/NUMERIC-7B` | `components/app/quiz/Numeric.tsx` |
| 29-quiz-ask-sheet | `/app/play/ASK-7B` | `components/app/quiz/Ask.tsx` |
| 30-quiz-focus-notice | `/app/play/FOCUS-7B` | `components/app/quiz/Play.tsx` |
| 31-quiz-late | `/app/play/LATE-7B` | `components/app/quiz/Play.tsx` |
| 32-quiz-connection-lost | `/app/play/FLAKY-7B` | `components/app/ConnectionPill.tsx` |
| 33-join-expired | `/app/checkin/EXPIRED-7B` | `components/app/quiz/JoinFailure.tsx` |
| 34-join-class | `/app/checkin/OTHER-8A` | `components/app/quiz/JoinFailure.tsx` |
| 35-join-ended | `/app/checkin/ENDED-7B` | `components/app/quiz/JoinFailure.tsx` |
| 36-join-unknown | `/app/checkin/NOPE-9` | `components/app/quiz/JoinFailure.tsx` |
| 37-join-offline | `/app/checkin/OFFLINE-7B` | `components/app/quiz/JoinFailure.tsx` |
| 38-practice-list | `/app/practice` | `app/(app)/app/practice/page.tsx`, `components/app/practice/PracticeRows.tsx` |
| 39-practice-question | `/app/practice/ps-session-math-1` | `app/(app)/app/practice/[id]/page.tsx`, `components/app/practice/Player.tsx` |
| 40-practice-right | `/app/practice/ps-session-math-1` | `components/app/practice/Player.tsx` |
| 41-practice-wrong | `/app/practice/ps-session-math-1` | `components/app/practice/Player.tsx` |
| 42-practice-done | `/app/practice/ps-session-math-1` | `components/app/practice/Player.tsx` |
| 43-practice-missing | `/app/practice/ps-nothing` | `components/app/practice/Player.tsx` |
| 44-notifications | `/app/notifications` | `app/(app)/app/notifications/page.tsx` |
| 45-notification-detail | `/app/notifications/n-math` | `app/(app)/app/notifications/[id]/page.tsx` |
| 46-profile | `/app/profile` | `app/(app)/app/profile/page.tsx` |
| 47-profile-editor | `/app/profile` | `components/app/ProfileEditor.tsx` |
| 48-settings | `/app/settings` | `app/(app)/app/settings/page.tsx` |
| 49-settings-push-sheet | `/app/settings` | `components/app/PushSheets.tsx` |
| 50-data | `/app/data` | `app/(app)/app/data/page.tsx` |
| 51-documents | `/app/documents` | `app/(app)/app/documents/page.tsx` |
| 52-faq | `/app/faq` | `app/(app)/app/faq/page.tsx` |
| 53-privacy | `/app/privacy` | `app/(app)/app/privacy/page.tsx` |
| 54-terms | `/app/terms` | `app/(app)/app/terms/page.tsx` |
| 55-signed-elsewhere | `/app/attendance` | `components/app/SessionScreens.tsx (SignedElsewhere)` |
| 56-unreachable | `/app` | `components/app/SessionScreens.tsx (Unreachable)` (not captured: the mock cannot make the session fail) |
| 57-offline-pill | `/app` | `components/app/ConnectionPill.tsx` |
| 58-not-found | `/app/does-not-exist` | `app/(app)/app/not-found.tsx`, `app/(app)/app/[...rest]/page.tsx` |
| 59-toast | `/app/profile` | `components/app/Shell.tsx (toast)` |
| 60-settings-language-sheet | `/app/settings` | `components/app/Shell.tsx (LangOptions)` |
| 61-profile-logout-confirm | `/app/profile` | `components/app/Shell.tsx (confirm sheet)` |
| 62-quiz-leave-confirm | `/app/play/MATH-7B` | `components/app/quiz/Play.tsx` |
| 63-settings-install-sheet | `/app/settings` | `components/app/Shell.tsx (install sheet)` |
| 64-quiz-answer-saved | `/app/play/OFFLINE-ANSWER-7B` | `components/app/ConnectionPill.tsx` |
| 65-quiz-ask-sent | `/app/play/ASK-7B` | `components/app/quiz/Ask.tsx` |
| 66-scan-no-camera | `/app/scan` | `app/(app)/app/scan/page.tsx` |
| (none) | any | `app/(app)/error.tsx`, the error boundary: only reached by a thrown error, not captured |

## Phase 0 baseline

Taken 2026-11-17 on d85fa4e, mock build (`NEXT_PUBLIC_E2E=1`), Chromium headless shell 1248.

- Pictures: 65 of 66 states, `tests/capture/student-screens.mjs` at 390 x 844, scale 2.
- JS (`js-size.json`, gzip -9 of every script response): all student screens 42 files,
  485,033 bytes gzip (1,584,803 raw); Home first load 23 files, 323,740 bytes gzip. The budget for
  this work: all screens under about 505,500 bytes gzip.
- Perf (`tests/capture/student-perf.mjs`, CPU 4x slower): no long tasks and no frame over 50 ms
  in any of the eight scenarios (press, tab tap, pager swipe, subject open and back, sheet, quiz
  question to verdict, practice answer, quiz ending); worst frame gap 41 ms. The long-task
  observer was checked: under the same throttle it reports a click that does 80 ms of work.
- Checks on the baseline: lint and types pass; 1537 of 1539 unit tests and 671 of 672 e2e tests
  pass in the full parallel run. The three that fail are timeouts under load and pass when run
  alone: `tests/unit/session-controller.test.ts` "keeps an answer it could not deliver..." and
  "counts a late answer...", which run close to Vitest's 5 s limit, and
  `tests/e2e/mock/practice.spec.ts` "Home's last result opens that lesson's own summary". A step
  that sees these three fail reruns them alone before it calls anything broken.

## The steps

Every step: a builder writes it, a separate reviewer checks it against the rules above (lenses:
impeccable, apple-design, platform-design-web with accessibility-review for reduced motion,
focus, hit targets and contrast, ui-ux-pro-max for layout and type only), then:

- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:e2e` all pass. Nothing may
  be listening on port 3100 before `pnpm test:e2e` (Playwright would reuse it and test an old
  build).
- A test that described the old animation is rewritten to describe the new one in the same
  change. No test is skipped, weakened or deleted to get green.
- `node tests/capture/student-perf.mjs <url>` (Chromium, CPU 4x slower): no new long tasks during
  the animations, compared with the baseline.
- `node tests/capture/student-screens.mjs <url> <dir>`: the resting state of every screen looks
  as before unless the step is meant to change it; the JS size change is recorded here.
- One commit, subject `Student motion: ...`, pushed to `animate-ui`; the preview link goes to the
  owner. `package.json` and `pnpm-lock.yaml` are committed only by the step that first imports
  `motion` (step 6), which also drops the unused `@animate-ui/react`.

### Step 1: tokens, budget, reduced motion, primitives

- Files: `lib/app/motion.ts` (new), `app/(app)/app.css`, `tests/unit/motion-tokens.test.ts` (new),
  this file.
- Done: `lib/app/motion.ts` holds the six springs as `{ duration, bounce }`, the derived
  `{ stiffness, damping, mass }` for Motion, and the sampler that makes the CSS `linear()`. The
  two new springs are in `app.css` next to the old ones; the old four are regenerated from the
  same sampler if they do not already match it. The unit test reads `app.css` and checks every
  `--spring-*` curve and `-dur` against `lib/app/motion.ts`. Two shared CSS primitives exist:
  a press primitive (squash to 0.94 on `:active` with `--spring-press`, release past 1 with
  `--spring-pop`, as a transition so it reverses mid-way) and a stagger primitive (children
  arrive `calc(var(--i) * 40ms)` apart on `--spring-pop` or `--spring-bouncy`, overshooting).
  One reduced-motion block covers both. The press rules that already exist (`.btn`, `.card`,
  `.round`, `.next`, `.scan-fab`, `.item`, `.tab`, `.opt`, `.result`, `.provider`, the quiz options)
  move onto the press primitive; step 2 reaches everything else. Nothing else on screen changes.
- Tested: the unit test; lint, types, unit, build, e2e.

### Step 2: press feedback on every tappable element

- Files: `app/(app)/app.css`, `app/(app)/quiz.css`, `app/(app)/practice.css`,
  `app/(app)/privacy.css`; components under `components/app/` and pages under `app/(app)/app/`
  only to add the press class where an element has no class to hang it on.
- Done: every button, link card, row, tab, option, chip, switch, round button and floating button
  in the student app squashes to about 0.94 on touch-down (large cards less, about 0.97, so a
  full-width card does not look broken) and springs back past 1 on release. A second tap
  mid-spring reverses from where it is. Disabled controls do not move. Under reduced motion a
  press is a short opacity or colour change, no scale. Hit targets stay at least 44 px and the
  focus ring is not clipped by the scale.
- Tested: an e2e check that representative tappables on Home, the quiz and practice carry the
  press transition and reach a scale under 1 while pressed, and none under reduced motion; perf
  scenario "press".

### Step 3: screen transitions with View Transitions

- Files: `components/app/Shell.tsx`, `lib/app/nav.ts`, `components/app/Pager.tsx`,
  `components/app/Top.tsx`, `components/app/Row.tsx`, `components/app/SubjectCard.tsx`,
  `components/app/ui.tsx`, the pages under `app/(app)/app/` that hold links or Back buttons,
  `app/(app)/app.css`, the affected specs in `tests/e2e/mock/`.
- Done: going deeper slides the new screen in from the right with a slight pop and the old one
  back and dimmed; Back does the reverse; a tab-bar tap swaps with a simultaneous 220 ms opacity
  crossfade, with no scale or delay (the first pop was too intense). The tab bar does not move. The pager's own swipe keeps its own slide and runs
  no view transition on top of it. The existing subject morph and quiz morphs keep working.
  Browser history moves (swipe back) stay as the browser draws them. Browsers without view
  transitions change screens at once. Reduced motion: a short crossfade. Taps pass through the
  overlay.
- Tested: e2e that forward, back and tab navigations carry the right transition type and still
  land on the right screen; a check that a tap during a transition still lands; perf "tabs",
  "subject".

### Step 4: entrances, lists and stagger, calm

The owner found the tab pop "way too intense" and chose calm for this step, which replaces the first wording ("each
overshooting").

- Files: `app/(app)/app.css`, `app/(app)/quiz.css`, `app/(app)/practice.css`, `app/(app)/privacy.css`, the pages under
  `app/(app)/app/`, the components under `components/app/` that render lists, cards, options and sheets.
- Done: rows, cards and list items rise 8 px and fade in, 35 ms apart, no scale and no zoom. The translate rides
  `--spring-snappy` (its overshoot on 8 px is barely felt, which is the point) and the opacity is its own 180 ms fade
  (`@keyframes arrive`, `arrive-fade`, the `.stagger > *` primitive; `.arrive` for one element). The stagger is capped: no item
  waits more than 210 ms (240 ms for rows of a list that fills late), so after the seventh the rest arrive together.
  - Tab switches (Home, Subjects, Alerts, Profile) stay the plain 220 ms crossfade, by tap or swipe, with nothing rising after
    it. Content already on a deeper screen moves with the slide, with no stagger on top.
  - The rise plays where content arrives on its own: the first Home of a session (the "Home rises once per session" rule stays),
    a list that fills after a loading state (`Gate` sets `data-arrive` on `<html>` for 700 ms, only when its data landed after
    the screen opened), search results on the Subjects tab (only rows that were not listed before), a new alert, and the error
    state and the join failure card.
  - Quiz and practice answer options on every new question stagger in 40 ms apart and pop from `scale(0.96)` on `--spring-pop`
    with a 160 ms fade. This is the only place in step 4 that scales. It animates `transform`, so the press squash (the `scale`
    property) still answers a tap while an option is arriving.
  - Sheets rise on `--spring-snappy` and leave in 230 ms, faster than they rise.
  - No entrance delays the first tap: content is tappable from its first frame. Quiz timing and the countdown are untouched.
  - Reduced motion: a plain 150 ms fade, no translate, no scale, no delay, for every one of the above.
- Tested: e2e that a question's options carry delays 30 to 50 ms apart and a tap on the last one during its arrival records the
  answer, that a tab switch and a deeper screen show no entrance, that a list that fills late staggers with capped delays, that
  Home rises once per session, that search rises only new rows, that a sheet rises slower than it leaves, and the same under
  reduced motion; a unit test of `Gate`; the a11y reduced-motion check; perf "quiz", "practice".

### Step 5: the big moments

- Files: `components/app/quiz/parts.tsx`, `components/app/quiz/Play.tsx`,
  `components/app/quiz/Numeric.tsx`, `components/app/practice/Player.tsx`,
  `components/app/practice/PracticeRows.tsx`, `components/app/Results.tsx`,
  `components/app/Summary.tsx`, `app/(app)/app/achievements/page.tsx`, `app/(app)/app/page.tsx`,
  `lib/app/tween.ts`, `app/(app)/quiz.css`, `app/(app)/practice.css`, `app/(app)/app.css`.
- Done: a right answer gets the big spring (a dip, then the check pops past full size, a ring
  pulse, a burst), points roll up with the number stretching as it lands; a wrong answer gets
  the small dip and settle; a new badge pops on `--spring-big` with a ring and a short confetti;
  the end of a lesson and a finished practice set get a confetti and rolling totals. Confetti is
  CSS (a few dozen absolutely placed spans, transform and opacity only, one shot, removed after).
  Nothing here changes when the verdict, the points or the next question arrive, and the
  countdown is never covered or delayed. Reduced motion: the same states arrive with a short fade
  and the numbers show their final value.
- Tested: e2e that the right and wrong verdicts, the ending and a new badge still show the same
  words and numbers and that the next question is answerable on time; the reduced-motion check;
  perf "quiz", "ended".

### Step 6: gestures, layout and exit

- Files: `components/app/Pager.tsx`, `components/app/Shell.tsx` (the sheet and the toast),
  `lib/app/motion.ts`, the components with an exit or a layout move found in step 6's survey,
  `package.json`, `pnpm-lock.yaml`, affected specs.
- Done: the size decision above is measured and recorded first. A released swipe on the pager and
  a released sheet carry the finger's velocity into the spring (a fast flick travels and settles,
  a slow release springs back), interruptible by a new touch. Things that leave (a sheet, the
  toast, a row that goes away) animate out instead of vanishing; things that move (the tab
  indicator, a row that changes place) move. The budget holds.
- Tested: the pager and sheet specs; perf "tabs", "sheet"; `js-size.json` against the baseline.

### Step 7: haptics

- Files: `components/app/quiz/parts.tsx` (the existing `buzz`), `lib/app/motion.ts`, the reward
  call sites from step 5.
- Done: one feature-detected `buzz` helper; short pulses on a right answer, a new badge, the end
  of a lesson and a finished practice set; none on ordinary taps; never while the page is hidden;
  no console message from a blocked call (Chrome blocks `vibrate` before the first tap, and the
  e2e fixture fails on console errors).
- Tested: a unit test of the helper with and without `navigator.vibrate`; e2e still clean.

### Step 8: the final gate (the planner)

Review of the whole diff against the rules, `review-animations`, `text-hygiene`, an axe pass,
reduced motion on every screen, the full build and test suite, the final JS size against the
baseline, removal of anything unused, the before and after pictures zipped for the owner.

## Record

(each step adds its line here: what was done, the checks, the JS size change, the commit)

- **Step 1, 2026-11-17.** Six springs in `lib/app/motion.ts` (press 0.15/0 210 ms, pop 0.2/0.6
  480 ms, snappy, smooth and bouncy as before, big 0.31/0.5 610 ms), every CSS curve sampled from
  them and checked by `tests/unit/motion-tokens.test.ts`. The press primitive squashes on
  `--spring-press` and springs back on `--spring-pop` through the `scale` property: measured 0.94
  then 1.015 for a button, 0.96 then 1.010 for full-width surfaces; a second press at 83 ms carries
  on from 0.998. Reduced motion: a 0.8 dim, no scale. The stagger primitive (`.stagger > *`, 40 ms
  per `--i`) is ready for step 4. Checks: lint, types, 1555 unit, 672 e2e all pass; no long tasks
  at 4x; JS +2 bytes gzip (raw identical). Resting pictures unchanged; the 14 that differ also
  differ between two runs of the same build (random lobby names, the countdown ring) or catch the
  scanner's camera error at a different moment. Left for step 2: `.q-me` lost its old squash with
  the move and is not on the primitive yet; `.opt`, `.result`, `.item` and `.tab` only change
  colour.
- **Step 2, 2026-11-17.** Every tappable squashes and springs back: rows, tabs, options, results,
  pills, the switch, FAQ questions, the Home avatar, chart dots, the toast, on top of step 1's set.
  Depths: 0.94 for controls, 0.96 for cards and quiz options, 0.98 for rows inside a grouped list
  (0.96 pulled them off the group's edges and looked cut out), 0.6 for the 44 px target of a
  10 px chart dot (at 0.94 it did nothing visible). The switch sets its own depth, since the
  custom property otherwise inherits the row's. The toast and chart dot centre with the
  `translate` property so `scale` does not move them. FAQ questions run edge to edge, so the
  press and the focus ring cover the row. Left still on purpose: links inside running text, the
  Ask sheet's "more" summary, text and number fields. Touch: React's passive `touchstart` on the
  document is the listener iOS needs for `:active`; Chromium tap gestures confirm the squash on
  touch-down. New spec `tests/e2e/mock/motion.spec.ts`, 27 tests (squash, centre, release,
  interruption, disabled, reduced motion), 81 of 81 over three repeats. Checks: lint, types,
  1555 unit, 699 e2e pass; no long tasks at 4x; JS +9 bytes gzip.
- **Step 3, 2026-11-17.** Screen changes run on the View Transitions API through React's
  `<ViewTransition>` (keyed on the path in `Shell`, `default="none"`) and `transitionTypes` on
  links and router calls. A deeper screen slides in from the right over the old one, which drifts
  back to -25% and dims (`--spring-smooth`); Back mirrors it. Back now lives in the Shell and
  reaches `Top` through `UIContext`, so it ships once instead of in every screen. A tab swap
  fades the old screen out in 80 ms and pops the new one in on `--spring-pop` 80 ms later, so two
  screens never show at once. The tab bar and scan button get a `view-transition-name` only while
  a transition runs, so they stay still. Untyped changes (redirects) show the new page at once;
  `::view-transition` takes no pointer events, so a tap reaches the live page. Reduced motion: a
  150 ms crossfade. Without the API every change is instant. Quiz: transitions fire only on
  entry, never during a question; the countdown and answers are untouched. Focus lands on `body`
  after every change, as before. Checks: lint, types, 1555 unit; e2e 704 of 710, the six (three
  teacher axe loads, the editor, one tab squash, the new tab test before its fix) pass alone;
  motion spec 114 of 114 over three repeats; no long tasks at 4x, worst frame gap 48 ms. JS
  -8,987 bytes gzip for all screens (476,046) and -1,463 on Home's first load: moving Back into
  the Shell took a router-and-history copy out of 21 screen chunks. Not verified: Safari and
  Firefox. Chromium 125 to 132 lacks `:active-view-transition`, so there the dock is not held
  still and the sliding screens lose their ground.
- **Step 3 follow-up, 2026-11-17.** The owner found the tab pop too intense, so the tab swap is now a simultaneous ~220 ms opacity crossfade with no scale, translate or delay (default plus-lighter blend kept, so no dimming); the dock stays still and forward and Back slides are unchanged. The tab timing test was rewritten for the new promise. Checks: lint, types, 1555 unit (two session-controller load flakes pass alone); e2e 710 passed, 4 skipped; motion spec 114 of 114 over three repeats (the new tab test needed a poll for the animations under load); mid-transition frames at 0 to 220 ms show both screens at matching partial opacity, no scale, no dimming, dock still; no long tasks at 4x, worst frame gap 51 ms; CSS only, JS unchanged.
- **Tab bar merge, 2026-11-17.** The owner's `student-seg-glide` (the five-slot tab bar, Subjects as a tab root, `SegGlide`'s one sliding piece, taps and swipes typed for the tab bar) is merged into `animate-ui`; only `Shell.tsx` conflicted. The tab swap stays the 220 ms opacity crossfade for all four tabs. A tap carries `tab`. A pager swipe now carries a type of its own, `swipe`, which has no class in the Shell maps: the swipe already slides the screen out and the next one in, and a crossfade after that was a second animation (with reduced motion nothing slides, so a swipe there carries `tab` and fades). `swipe` is off for the subject morph too (`TAB_SAFE_MORPH`). The dock is still the one named group: its old snapshot is hidden and the live dock shows, so `SegGlide`'s piece slides once and keeps moving through the transition, and the scan button, now inside the bar, is covered by the same name (it keeps `nav-forward` for opening the scanner). `leave` in `lib/app/nav.ts` now goes through `goBack`, so closing the scanner slides back instead of being instant. Subjects rows slide forward into a subject (the morph is kept) and Back returns with the Back slide. Home's subjects row was already gone with the owner's change, and nothing referenced it. Capture tools: `student-perf.mjs` taps four tabs, swipes across four sections and opens a subject from the Subjects tab; all 66 states are still reached, `09-subjects` is the Subjects tab. Tests: `motion.spec.ts` picks tabs by address instead of position and its swipe test expects the `swipe` type on the Subjects tab; `seg.spec.ts` counts only subject morphs (the screens' own view-transition groups are not morphs). Checks: lint, types, unit (two session-controller load flakes pass alone); e2e, `motion.spec.ts` and `seg.spec.ts` three repeats; mid-transition frames of tab taps, a swipe, a subject, the scanner and reduced motion show one piece and a still dock; no long tasks at 4x, worst frame gap 49 ms. JS: all screens 476,952 gzip (+906 against step 3), Home's first load 335,015 (+12,738; the tab bar's `SegGlide` and the springs it samples are in the Home bundle).
- **Step 4, 2026-11-17.** Calm entrances. `@keyframes arrive` and the `.stagger > *` primitive are now an 8 px rise on `--spring-snappy` plus a 180 ms fade, 35 ms apart, delay capped at 210 ms, no scale; `.rise` (Home, once per session), `.arrive` and `.item--fresh` (a new alert) share it. A list that fills after a loading state rises through `Gate` (`data-arrive` on `<html>` for 700 ms, only when the data landed after the screen opened; rows start at 40 ms and never wait over 240 ms); Subjects search rises only rows that were not listed (`Found` in `subjects/page.tsx`); the error state and the join failure card rise. Tab switches (tap and swipe) and deeper screens show nothing on top of the crossfade and the slide. Quiz and practice options pop from `scale(0.96)` on `--spring-pop` with a 160 ms fade, 40 ms apart (`q-opt-in`, on `transform` so the press squash still works mid-arrival; a tap on the last option mid-arrival records the answer). The sheet rises on `--spring-snappy` and leaves in 230 ms. Reduced motion: a 150 ms fade, no delay, for all of it. New e2e in `motion.spec.ts` (12 tests) and `tests/unit/gate-arrive.test.tsx`. Checks: lint, types, 1558 unit, e2e 732 passed and 4 skipped (one teacher live keyboard test failed under load and passes alone); motion, seg and tabs specs 186 of 186 over three repeats; frames of Home, quiz and practice options, the sheet, search, a tab switch, a deeper slide and reduced motion look calm; no long tasks at 4x, worst frame gap 49 ms (quiz question to verdict 46 ms, practice answer 45 ms). JS: all screens 478,874 gzip (+1,922), Home's first load 335,952 (+937). Part A: the +12.7 KB on Home's first load is not SegGlide. The Subjects tab in the bar is a `<Link>` that is always in view, so Next prefetches the Subjects route on Home, and that route's chunk carries its own copy of `SubjectCard.tsx` (about 30 KB raw, 7 phosphor icons with every weight inlined); before the merge no link to Subjects was in view on Home (its "All subjects" row was below the fold), so that chunk was never fetched with Home. The module is duplicated across the Home and Subjects route chunk groups by Turbopack, not shared. Not changed: removing it means `prefetch={false}` on the Subjects tab link in `Shell.tsx` (the tab would load its chunk on the tap) or trimming the icons in `SubjectCard`; both need the owner. Planner decision on Part A: the Subjects prefetch from Home stays, because it runs after Home is interactive and makes the tab instant; reviewer measurement at 4x CPU over three fresh loads of /app: first paint 64 ms (the server-rendered launch picture), the only long tasks are the two hydration ones at about 70 ms and 190 ms (58 to 69 ms each, before any prefetched chunk arrives), none after, and a tab tap right after load answers in 40 to 64 ms (event timing) and lands the screen in about 150 ms, with 12 of the 30 chunk requests going out after the load event. Review fixes: `Gate` now counts holders of `data-arrive` (a Gate that ends or unmounts no longer clears it while another is still rising), and the first child of a screen (the header, which React keeps through the loading to ready swap) is left out of the late-list entrance so it does not blink; Home counts as seen when left within its intro, so a quick tab and back does not replay it; a sheet closed mid-rise freezes where it is and leaves from there (it used to vanish at once); `html[data-rise-seen] .rise` outranks `[data-arrive]`. Resting pictures: 07 and 08 differ from the merge only in the antialiased edge of the cards (no `both` fill holding a transform any more); the quiz ones differ run to run, as before.
- **Tab bar follow-ups and CI, 2026-11-18.** The owner's four follow-ups on `student-seg-glide` (a pressed tab has no square of its own; the piece's leading edge overshoots by about 1.5% before the stop and the trailing edge has no bounce, so nothing passes the goal after the stop; the scan button sits inside the bar at 56 px) are merged into `animate-ui`; `Shell.tsx` conflicted on the scan link (kept our `nav-forward` type, took their 30 px icon) and `seg.spec.ts` on the helpers (kept both). Their pill motion and scan placement win; the View Transitions, press primitive and calm arrivals are untouched. CI was red for two test causes, neither a product fault. (1) `seg.spec` "one piece slides from Home to Profile": the test read the piece from `requestAnimationFrame` in the page, one sample per frame, and a loaded runner draws too few frames to catch the short overshoot or the moment the piece spans both tabs (reproduced locally with a 6x CPU throttle: no overshoot seen). `tapAndWatch` now waits for SegGlide's Web Animations, pauses them and steps their own timeline in 8 ms steps, so the samples are the same on any machine; the promises are unchanged. The subject-morph control in the same file had the same disease (a 1.2 s window started before the click, which on a slow runner used it up) and now watches until 1.3 s after the click. (2) `motion.spec` "a tab-bar tap asks for tab" (and the nav-forward and nav-back tests next to it): the last `startViewTransition` call overall was read once, but an untyped call (content arriving, which does nothing) can land after the typed one, and the typed one can land after the URL changes. The tests now take the last call that carried a type and poll for it. Checks: lint, types, unit, e2e, then seg, motion and tabs specs five repeats, and five repeats again under a 4x CPU throttle (255 of 255; the step 4 entrance timing tests are not meant for a 6x throttle).
- **A tab tap always crossfades, 2026-11-18.** Cause: React sometimes hands the transition of a tab tap no types at all (the `tab` the Link added is lost: the router finishes the navigation in a transition of its own; about 1 in 80 taps at 4x CPU, Subjects to Home and Profile to Alerts seen). The call is then untyped, the Shell maps fall to `default: none` and the swap shows no crossfade, and the Home and Subjects cards share a name and morph into each other. No second `startViewTransition` was found: every tap makes exactly one call, none is skipped, with and without a 4x throttle, for every tab pair and the scan button. Fix: Shell keeps the tab tap itself (`tap`: the two screens it joins, forgotten on any other screen or on a tap outside the tab bar) and, while it holds, uses `ENTER_TAB` and `EXIT_TAB` (default `tab`) and `TabTapContext` tells the subject cards and Home's next-lesson card to share no morph (`useSubjectMorph`). `swipe` is now named in the Shell maps (none). New `tab-crossfade.spec.ts`: each tab tapped from another, at 1x and 4x CPU, checks every call is a tab one, none skipped (`ready` and `finished` resolve), the vt-fade-out and vt-fade-in ran, no subject morph, the new screen showing. `motion.spec` no longer asks the type itself of a tap: it asks that no slide or swipe type is asked.
- **Step 5, 2026-11-18.** The big moments. A right answer: the badge pops from 0.3 to past full size on `--spring-big` (`q-badge--big`), one yellow ring leaves it (`.q-badge-wrap::after`), the existing 12-piece burst flies, and the points roll up then land squashed (scale 1.18 x 0.82) and spring back past size (`q-land`, started after the roll, so no fill and the roll is untouched). A wrong answer, or a timeout: the badge drops 6 px and settles on `--spring-snappy` (`q-dip`), no shake, no burst. Practice: a right answer's check pops on the big spring with a small burst (`--k` scales the burst's reach); a wrong verdict card dips. The end of a lesson and a finished practice set: the badge pops on the big spring with the ring and one confetti shot, the total lands squashed. A new badge on the achievements page pops on `--spring-big` with confetti (it replaced the bouncy pop). Confetti is one small component, `components/app/Confetti.tsx`: 28 absolutely placed spans (20 for a badge), transform and opacity, one shot, yellow and ice-blue tokens, laid out by a pure function, removed from the DOM after 1.7 s; it sits behind the badge (the badge is positioned above it), takes no touches and never appears on the question or the countdown. It reads reduced motion itself instead of importing `quiz/parts`, which pulled the quiz chrome into the achievements chunk. Reduced motion: no confetti, no ring, no stretch; the badge fades; numbers show their final value at once. Nothing changes when the verdict, points or next question arrive; no copy changed. `Results.tsx`, `Summary.tsx`, `tween.ts` and Home needed nothing (they have no reward moment or rolling total). Tests: new `rewards.spec.ts` (7: right and wrong verdicts, next question answerable, ending plus new badge with confetti removed, practice end, reduced motion x2) and `tests/unit/confetti.test.ts`. Checks: lint, types, 1563 unit, e2e 750 passed and 4 skipped, no failures. Perf at 4x CPU: quiz question to verdict worst gap 46 ms, practice 41 ms, ended 23 ms, no long task from the rewards (one 60 ms long task in the quiz scenario in one of two runs, none in the other). JS: all screens 481,391 gzip against 480,030 at HEAD 219638a (+1,361 gzip, +3.3 KB raw), Home's first load unchanged. Frames of a right answer, a wrong answer, the ending and the practice end are in the scratchpad `step5/`. Review (2026-11-18): the ring was left drawn round the badge after it played (no fill, and `animation: none` under reduced motion), now it fills and is hidden under reduced motion; text over the badges (heroes, a badge's words) is lifted above the confetti; timing, state and the DOM removal were verified unchanged, perf showed no long task in three runs.
- **Step 6, size decision, 2026-11-18.** Nothing in the app imported `motion` or `@animate-ui/react`; both were only in the uncommitted `package.json` and `pnpm-lock.yaml`. Options: (a) the house spring with an initial velocity, sampled to WAAPI keyframes the way `SegGlide` does, no dependency; (b) `motion/mini` `animate` with `spring`, about 5 KB gzip in the earlier probe; (c) `LazyMotion` + `m` with `domAnimation`, about 31 KB, over the budget with what step 6 needs. Chosen (a): the damped-oscillator solution takes a starting speed (`position(spring, t, v0)`, a closed form, the same one that makes the CSS curves), so the release speed of a swipe or a sheet carries into the spring, and an interruption is read from the live transform, cancelled and continued from there, which is all a drag handoff needs. Only the probe numbers are recorded for (b) and (c): neither was built into the app, because (a) does the whole job. Both packages are removed: `git checkout` of `package.json` and `pnpm-lock.yaml` puts them back at HEAD (the 106 added lines were only these two packages and their `framer-motion`, `motion-dom` and `motion-utils`), so this commit changes no dependency file, and `pnpm install --frozen-lockfile` leaves `node_modules` without them. Measured on the build before step 6 (Step 5 Record): all screens 481,391 gzip, baseline 485,033.
- **Step 6, 2026-11-18.** Gestures, exits and moves, on the house spring (no new dependency). `lib/app/motion.ts`: `position` takes a starting speed, `sampleThrow` samples it to keyframes (speed capped at 12 goals per second, `reach` is when it first gets to 1) and `throwTo` runs them as WAAPI `translateX` or `translateY` keyframes. Survey, what already existed: the pager tracked `Gesture.v` but exited in a fixed 190 ms, came in in 300 ms ease-out and sprang back on a speed-less CSS spring; the sheet (`Shell.tsx`) already threw itself at the flick's speed and froze a half-risen sheet with `commitStyles`; the toast has `toast--out`; `SegGlide` moves the tab indicator. What had no exit or no move: the Subjects search rows (`app/(app)/app/subjects/page.tsx`, rows filtered out vanish and the rest jump) and nothing else that is a removal in the student app (there is no dismissed notification or removed scan: alerts are only marked read, `notifications/page.tsx:41`). Left alone and why: the "mark all read" button (`notifications/page.tsx:41`) and `ConnectionPill.tsx` vanish with no exit (one is a button in a column, the other sits in the quiz chrome, which the step may not touch), the Practice rows that change from open to done on a new screen, and the profile photo button. Pager: a release carries the finger's speed into `snappy`, a flick leaves on it and the next section comes in on the same speed, a slow short release springs back, a finger that stopped before it lifted leaves with no speed (100 ms), a new touch reads the live `translateX`, cancels the move and goes on from there (a touch that was no swipe lets the screen go again). The route changes as the screen reaches the edge (`reach - 15 ms`). Edge guard, watchdog, busy guard (now only from release until the route has changed, so a touch in the settle is allowed), unmount cleanup and the `swipe` and reduced-motion `tab` types are as they were. One fix: with reduced motion the pager used to slide the next section in anyway (the incoming side was set before the reduced-motion check); now nothing travels. Sheet: a release below the threshold springs back on `snappy` with the finger's speed on WAAPI, and a touch on the grabber catches it where it is (the old transition-based settle started from 0 and jumped); the flick-close was already at the flick's speed. Exits and moves: `components/app/MotionList.tsx` (used for both lists on Subjects) puts a row the search took away back out of the flow, fades it up 6 px in 160 ms and removes it, and slides the rows that stay (a FLIP of `translateY` on `snappy`); it stays mounted when nothing matches, so the last rows still fade; reduced motion: a fade only, no slide. Transform and opacity only. Tests: new `tests/e2e/mock/gestures.spec.ts` (12: fast flick, slow spring-back, a stopped finger, a touch in the settle with the spring frozen so it does not depend on speed, a caught tap, reduced motion, the sheet flick, spring-back and catch, the toast exit transition, a search row's exit and slide, reduced motion, the last rows) and four unit tests of the velocity spring (starts at 0 with the given speed, settles at 1, a flick arrives sooner, the cap). Checks: lint (one old warning in the website), types, 1571 unit, build, e2e 762 passed and 4 skipped with no failures and no load flakes (motion, tab-crossfade, rewards and seg specs included; the new spec 5 times over). Perf at 4x CPU: no long task and no frame over 50 ms in any of the eight scenarios; tabs-tap 42 ms, pager swipe 41 ms, sheet 39 ms worst gap (step 3 follow-up: 48 to 51 ms). JS: all screens 482,703 gzip against 481,391 at step 5 (+1,312 gzip, +2.9 KB raw), 2,330 under the Phase 0 baseline of 485,033; Home's first load 338,055 against 336,743 (+1,312). Frames of a flick, a slow release, a touch in the settle, a sheet flick-close and spring-back, a toast exit and a search are in the scratchpad `step6/`. A flick shows a blank beat between the old screen leaving and the new one arriving (about 100 ms, the route render, as before the step). Review: the beat was not the route render (the route committed one frame after `router.replace`, and the neighbours are already prefetched when a drag locks) but the pager waiting for the spring's whole tail before it asked for the route; it now asks when the screen is 90% off (`near` from `sampleThrow`), and measured from the screen's transform on every frame (a synthetic flick, six runs each) the gap between the old section being 95% off and the new one starting went from 83 to 100 ms to 29 to 33 ms, the same at 4x CPU; the velocity maths was checked for every spring in `SPRINGS` (start 0, start speed, settles at 1) and the full suite, the five step specs three times over and perf at 1x (no long task, worst gap 40 ms on the pager, 39 on the sheet) were run. Not verified: Safari and a real finger (the flick tests send pointer events from inside the page; the slow ones use the mouse).

- **Step 7, 2026-11-18.** Haptics on rewards. One helper, `buzz`, moved from `components/app/quiz/parts.tsx` to `lib/app/haptics.ts` with the patterns named in `HAPTICS` (right `[18, 60, 28]`, wrong `20`, badge `[16, 50, 16]`, done `[20, 40, 30]` = 90 ms, send `14`, problem `40`). `buzz` does nothing without `navigator.vibrate`, while the page is not visible, or before `navigator.userActivation.hasBeenActive` (Chrome blocks `vibrate` before the first tap and logs a message, which the e2e fixture fails on); the try/catch stays. Call sites: live quiz right and wrong (`Play.tsx`, on the stage change), wrong lowered from 70 to 20 because 70 ms reads as a punishment and a wrong answer gets only a small reaction; live quiz end (`Ended`, once on mount); practice right answer (`practice/Player.tsx`, `Step`, effect keyed on the right verdict, ref-guarded); practice end (`End`, on `finished`, ref-guarded); new badge (`achievements/page.tsx`, one double however many are new, ref-guarded); the `14` send ticks (`Play.tsx` Question, `Player.tsx`, `Numeric.tsx`, `Ask.tsx`) and the `40` validation buzzes (`Numeric.tsx`, `Ask.tsx`) kept. Nothing on navigation, tabs, presses or sheets. A new document starts with no gesture, so a deep link straight to Achievements does not buzz until the student has tapped; reaching it from Profile does. Left alone: `app/(app)/app/scan/page.tsx:76` calls `navigator.vibrate(60)` directly (outside this step's files). Tests: `tests/unit/haptics.test.ts` (7) and `tests/e2e/mock/haptics.spec.ts` (6: no calls on tab taps, wrong tick, lesson end once, practice right and end once, badge once, no console error with the browser's own `vibrate`). Checks: lint, types, 1584 unit, build, e2e 767 passed and 4 skipped, 1 failure (teacher questions "Cancel sends nothing", a known load flake) that passes alone. JS: all screens 483,394 gzip against 482,703 at step 6 (+691), 1,639 under the Phase 0 baseline of 485,033; Home's first load 338,081 against 338,055 (+26).
