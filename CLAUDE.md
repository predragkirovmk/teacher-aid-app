@AGENTS.md

# TeacherAid app

One Next.js app with three surfaces. Know which one you are in before you change anything.

| Surface | Code | Styles | Notes |
|---|---|---|---|
| Website (mk, en) | `app/(mk)`, `app/(en)`, `components/site-v2` | `app/site-v2.css` | Design rules in `docs/site-v2/DESIGN.md` |
| Student app | `app/(app)`, `components/app`, `lib/app` | its own | On phones, in class |
| Teacher app, `/teacher` | `app/(teacher)`, `components/teacher`, `lib/teacher` | `app/(teacher)/teacher.css` | On a school laptop and a projector |

The teacher app runs on a mock that lives in the browser (`lib/teacher/api/mock*.ts`, demo teacher
Марија Петровска). There is no backend in this repo; see "Backend handoff" below.

Stack: Next.js 16 App Router, React 19, TypeScript, pnpm, hand-written CSS (no Tailwind in the
teacher app), `@phosphor-icons/react`, GSAP, Golos Text through `next/font`. Read the Next guide in
`node_modules/next/dist/docs/` before writing Next code: this version differs from what you know.

## Commands

    pnpm lint          pnpm typecheck        pnpm test         pnpm build
    pnpm test:e2e      # builds, serves on :3100, runs the mock and teacher Playwright projects

All five pass before anything is pushed. CI (`.github/workflows/ci.yml`) runs them again on every
push; a pull request is not done until CI is green on its head.

Running the teacher tests quickly while you work:

    NEXT_PUBLIC_E2E=1 pnpm exec next build          # the flag is needed: see playwright.config.ts
    pnpm exec next start -p 3100 &
    E2E_SKIP_BUILD=1 pnpm exec playwright test --project=teacher tests/e2e/teacher/today.spec.ts

In a cloud container the browser is already installed: do not run `playwright install`; point a
copy of the config at it (`launchOptions.executablePath: "/opt/pw-browsers/chromium"`,
`channel: undefined`) and pass `--trace off`. Rebuild after every CSS or component change; the
tests run against the build, not against `next dev`.

## The work in progress: the teacher redesign

The owner finds the teacher app crowded and confusing and wants it simple, with an Apple-like
calm. Every feature stays; the UI and UX change. The plan, the status and the record of each step
are in `docs/teacher-redesign-plan.md`. Read it first, every session. `docs/teacher-plan.md` holds
the rules of the app itself ("Simplicity first", "Design tokens"); keep the two in step.

How the work moves, and this is not optional:

1. One step at a time, in the order of the plan. A step is built whole, checked, and shown.
2. Showing a step means: every check green, pushed, and the review page (its link is in the plan)
   republished with the step marked ready, the preview link and before and after pictures.
3. The owner approves or sends back on that page. The decision is a record in the page's store
   (`decisions/step-N`). It does not arrive in the chat by itself: read the store before you say
   you are waiting, and before you start the next step. A message in the chat is not an approval
   unless the owner says so in their own words.
4. Never start the next step on a guess. If a step is sent back, fix it and show it again.
5. When a step is shown, record it: the plan's Status, and in the brain the day's note and
   `Areas/product/teacher-app-redesign.md`.

## What good looks like in the teacher app

A teacher uses this in front of a class, on a weak laptop, with no time to think. Judge every
screen by that.

- **One job per screen.** One main button a screen: deep teal, 48px, a pill. Everything else is
  quiet (44px). Nothing is hidden behind hover, right-click, drag or a shortcut.
- **Yellow means a lesson is live** and nothing else. Red is for End and for warnings.
- **Type carries the order**: one large title, 17px body, 16px floor, bold only for names and
  numbers. Golos Text everywhere.
- **Calm surfaces**: white panels on the pale ground, a hairline ring, radius 20 to 22px, one soft
  shadow under what floats. No decoration that carries no meaning.
- **The projected class view (`.cv`) is its own dark world.** It is read from the back of a room.
  Its palette is set on `.cv` itself; a change to the rest of the app must leave its pictures the
  same, pixel for pixel, unless the step is about the projector.
- **Words**: Macedonian first, English second, both in `lib/teacher/i18n.ts`. Plain words a teacher
  uses; no jargon, no exclamation, no emoji. Do not reword what already works.
- **Access is part of the look, not a pass at the end**: text at 4.5:1 or better, never dimmed with
  opacity (axe measures what is painted); colour is never the only sign (teal and ink cannot be
  told apart by colour, so a state also has a word, an icon or an edge); visible focus; Windows
  high contrast; reduced motion leaves only short fades; it works at 200% zoom and from 1024 wide.

Use the tokens at the top of `teacher.css` (`--ink`, `--teal`, `--tint`, `--fs-*`, `--r-*`,
`--tap`, `--tap-small`, `--row`). Do not write a raw colour or size where a token exists, and do
not read the projector's own names (`--deep`, `--text`, ...) outside `.cv`. UI libraries are
allowed where they carry behaviour that is hard to get right by hand (tabs, menus, segmented
controls): headless ones, styled with these tokens. Name any you add in the step's notes.

## How to work on a screen

1. Read the screen's component and its tests before changing it. The tests say, in plain words,
   what the screen promises (`tests/e2e/teacher/*.spec.ts`).
2. Capture it before you change it, then after, at 1440 x 900 and at a phone and a tablet width,
   and look at the pictures yourself: `node scripts/teacher-capture.mjs http://localhost:3100
   <out-dir> [width] [height]` walks the main screens and a live lesson (in a cloud container set
   `CHROMIUM_PATH=/opt/pw-browsers/chromium`). A change you have not looked at is not finished.
   Check the states it does not reach too: empty, loading, error, a dialog open.
3. Change the smallest thing that gets the result. Keep markup, names and flows unless the step is
   about them; restyle through the tokens.
4. Rewrite the tests that described the old design so they describe the new one, in the same
   change. Never skip, weaken or delete a test to get green. A test that fails once is not "flaky"
   until you know why.
5. Run the checks, then commit.

## Tests

- Playwright projects: `mock` (student app), `teacher`, `live` (against `tests/fake-api`). Unit
  tests are Vitest.
- Helpers in `tests/e2e/teacher/fixtures.ts` and `live-helpers.ts`: `mainButton(page)` is the
  screen's one main button; `tall(locator)` measures a height to a hundredth of a pixel (compare
  heights with it, not with raw floats); the clock is fixed, so move it instead of waiting.
- Sizes asserted today: main button 48px, other buttons 44px, a row that is chosen 56px, words
  never under 16px. `a11y.spec.ts` runs axe on every screen and must stay clean.

## Git and pull requests

- Small, focused commits. Subjects in the style of the log: `Teacher redesign: the plan`,
  `Teacher tests: measure a size to a hundredth of a pixel`. Say what changed and why in plain
  words.
- Work on the branch you were given, in one draft pull request. Vercel builds a preview for every
  push (`teacher-aid-git-<branch>-predragkirovmks-projects.vercel.app`); production is `main`.
  Never push to `main` and never merge on your own.
- When the files a browser keeps change (the manifest, the offline page, icons), edit the header
  comment of `public/teacher-sw.js` so installed copies fetch them again.

## Fences

- A teacher-app task changes only `app/(teacher)`, `components/teacher`, `lib/teacher`, their
  tests and their docs. `components/app/Mark.tsx` is shared with the student app: do not edit it.
- Code and comments are in English, in plain sentences that say why. No emojis anywhere.
- Never put a secret, a key or a person's private details in the repo, a commit or a request.

## Backend handoff

The backend developer builds the API from two documents in the TeacherAid brain:
`~/Desktop/teacher-aid-brain/Areas/product/backend-handoff/backend-spec-for-agents.md` and
`backend-guide-for-developer.md` next to it. When a change here alters what the API must provide
(a new field, screen, flow, state or rule), update both documents in the brain in the same
session, following the rule in `~/Desktop/teacher-aid-brain/CLAUDE.md`. Mock data in `/app` is
never a source for them. A change of look alone asks nothing of the API.

## SEO and GEO skills

`/seo` (claude-seo) and `/geo` (geo-seo-claude) are vendored in `.claude/skills/`. Run their
commands from the repo root; set up their Python runtimes once with
`bash scripts/seo-skills-setup.sh`. Where the two packs disagree, follow
`.claude/skills/README.md`.
