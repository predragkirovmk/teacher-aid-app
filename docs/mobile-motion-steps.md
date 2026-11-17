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
- Lists and answer options stagger 30 to 50 ms apart, each overshooting.
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
   exit. Never the full `motion` component, never Animate UI components.
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
| Small | every tap, tab change, screen change, list arrival, sheet | squash 0.94 then `--spring-pop`; screen moves on `--spring-smooth` with a slight pop; stagger 30 to 50 ms |
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
  back and dimmed; Back does the reverse; a tab-bar tap swaps with a short fade and scale on
  `--spring-pop`. The tab bar does not move. The pager's own swipe keeps its own slide and runs
  no view transition on top of it. The existing subject morph and quiz morphs keep working.
  Browser history moves (swipe back) stay as the browser draws them. Browsers without view
  transitions change screens at once. Reduced motion: a short crossfade. Taps pass through the
  overlay.
- Tested: e2e that forward, back and tab navigations carry the right transition type and still
  land on the right screen; a check that a tap during a transition still lands; perf "tabs",
  "subject".

### Step 4: entrances, lists and stagger on every screen

- Files: `app/(app)/app.css`, `app/(app)/quiz.css`, `app/(app)/practice.css`,
  `app/(app)/privacy.css`, the pages under `app/(app)/app/`, the components under
  `components/app/` that render lists, cards and answer options.
- Done: every screen's content arrives with the stagger primitive (header first, then cards or
  rows 30 to 50 ms apart, each overshooting), answer options on every question stagger in with
  a pop, sheets rise on `--spring-smooth` with a small overshoot, empty, error and offline states
  arrive the same way. The existing "Home rises once per session" rule stays: a screen already
  seen in this session does not replay its stagger when returned to from a tab or Back. No
  entrance delays the first tap: content is tappable from the first frame. Reduced motion: a
  plain short fade.
- Tested: e2e that a question's options carry staggered delays 30 to 50 ms apart and are
  clickable at once; the a11y reduced-motion check; perf "quiz", "practice".

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
