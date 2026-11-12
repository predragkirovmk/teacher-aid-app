# TeacherAid teacher app: redesign plan

Started 2026-11-12. The owner's words: the app at `teacheraid.education/teacher` feels crowded,
complex and confusing; it is for teachers, so it must be simple; the feel wanted is Apple luxury.
Keep every feature, change the UI and UX, drastically if needed. Plan first. Every major change
goes through a link where the owner approves or denies it before the next one starts.

This plan sits beside `docs/teacher-plan.md` (the v1 build). Where the two differ, that plan
holds until the owner approves the direction below; after that, this one does.

## Review page

https://claude.ai/artifact/GaAL6hpukNw9EnvFB3KvdJ (private to the owner).

It holds the findings, four mockups in two looks (light, dark teal), the rules this changes, and
the steps. The owner's decisions are saved in the page's own store, one document a step:
`decisions/direction`, `decisions/step-1` to `decisions/step-7`, each
`{ choice: "approved" | "changes", look?: "light" | "dark", note, at }`. Read them before starting
a step; a decision there is the owner's, made with the page's buttons.

When a step is built: capture before and after, republish the page with the step set to "ready
for review", its preview link and the pictures, and wait.

## Status

- 2026-11-12: plan published.
- 2026-11-12, 10:10 UTC: the owner approved the direction with look A, light
  (`decisions/direction`). Their note: UI libraries are allowed. Step 1 is being built.

A decision made on the page does not reach the session by itself. Read the store before
every message that says what is being waited for, and, while a step waits for the owner,
check it on a schedule rather than only when a "go" arrives in the chat.

## What was measured

`main` at 3dc6a64, mock mode, a 1280x800 window, the demo school.

| Screen | Height | Controls in the page | Share of text at weight 600 or more |
|---|---|---|---|
| Today | 1.0 screens | 6 | 69% |
| Lessons (13 lessons) | 3.0 | 28 | 79% |
| Prepare a lesson | 1.6 | 9 | 42% |
| A lesson (6 questions) | 4.0 | 5 | 59% |
| The editor (6 questions) | 5.7 | not counted | not counted |
| Classes | 1.1 | 5 | 53% |
| A class's results | 6.9 | 23 | 56% |
| Library | 1.7 | 9 | 44% |
| Settings | 2.8 | 8 | 54% |
| Live lesson, waiting for students | 3.1 | 18 | 87% |
| Live lesson, a question open | 4.2 | 25 | 82% |

With a question open, "Заврши го часот" is 3,187px down the page: four screens.

What follows from it:

1. Everything is bold, boxed and outlined, so nothing leads.
2. Every row is a card with a button and a link; the card itself does nothing. 13 lessons, 26
   controls.
3. The live lesson, the screen used in front of a class, is one of the longest: six panels in a
   column, End at the bottom.
4. A class's results are eight sections on one page; the editor draws every question as a stack
   of outlined boxes.
5. Sidebar, ground and cards are three close dark teals held apart by white outlines. Heavy, and
   hard to read on a school laptop in a bright room.

## Direction (proposed)

Five rules:

1. **One job per screen.** What the teacher does now; the rest one labelled click away. Still
   nothing behind hover, right-click, drag or shortcuts.
2. **Lists, not stacks of boxes.** Rows on one surface with hairlines. The whole row opens. One
   button a row.
3. **One accent.** Deep teal for the main action. Yellow only while a lesson is live.
4. **Type carries the hierarchy.** One large title, regular text, weight 600 and up only for names
   and numbers. Nothing under 16px.
5. **The live lesson fits one screen.** The question and the next step stay put; the class, the
   questions and End sit beside them.

### Look A, light (recommended)

The website's paper and teal ink (`docs/site-v2/DESIGN.md`), brought into the app.

| Token | Value | Use |
|---|---|---|
| ground | `#EEF2F2` | Window ground |
| surface | `#FFFFFF` | Lists, panels, the floating sidebar |
| ink | `#0D2A32` | Text (15.1:1 on white) |
| ink-2 | `#4A6068` | Secondary text (6.6:1 on white, 5.9:1 on the ground) |
| ink-3 | `#8A9BA1` | Chevrons and other marks that carry no meaning alone |
| hairline | `rgba(13,42,50,.09)` | Separators; `.20` for the edge of a control |
| teal | `#124554` | Main button with white text (10.5:1), links, selected text |
| tint | `#E1ECEE` | Selected menu row, quiet buttons (teal on it 8.7:1) |
| yellow | `#FFC83E` | A live lesson only: the "Во живо" mark, the countdown. Ink on it 9.3:1 |
| red | `#B42318` | End and warnings (6.6:1 on white) |

### Look B, dark teal

The same layout on the present colours, flattened: ground `#0C303B`, panel `#103C49`, surface
`#124554`, white text, secondary `#C3D8DC`, the main button stays yellow with ink text.

### Both looks

- Type: Golos Text for everything (it is already loaded for titles), so a Windows laptop and a Mac
  show the same letters. Title 40px/650, section 20px/600, row title 18px/600, body 17px, secondary
  16px, floor 16px.
- Main buttons 48px tall, others 44px, pills. Rows about 72px.
- Radius 20 to 22px on surfaces, 12 to 13px inside them. Almost no shadow: a hairline ring on
  surfaces, one soft shadow under things that float (sidebar, save bar, windows).
- The sidebar is a floating panel, 248px: the four places, then Settings, Help, Sign out (quiet),
  then who is signed in. The name pill at the top right of every page goes.
- The projected class view stays dark teal in both looks.
- Motion stays as built on 2026-11-08, retuned for the new surfaces.
- UI libraries are allowed (owner, 2026-11-12). Use one where it carries behaviour that is hard to
  get right by hand, the tabs, the segmented controls and menus of steps 4 and 5 first: a headless,
  accessible set of primitives, styled with the app's own tokens in `teacher.css`. No library that
  brings its own look, and none for what a few lines of CSS already do. Check `package.json` before
  adding one, and name it in the step's notes.

## Earlier rules this replaces, if approved

From `docs/teacher-plan.md` ("Simplicity first", "Design tokens"):

| Rule today | Proposed |
|---|---|
| Dark teal only, no light mode | Light by default (look A); the projector stays dark teal |
| One yellow button per screen | The main button is deep teal; yellow marks a live lesson |
| Buttons 56px, small ones 48px | 48px main, 44px others |
| A button and a link on every card | The whole row opens; one button a row |
| Body 18px | 17px; the 16px floor stays |
| The sidebar on every screen | It steps aside during a live lesson; "Денес" (back) stays |

## What stays

Every feature and flow. Macedonian first, English second, the same wording. Right and wrong as
an icon and a word, never colour alone; red for End and warnings only. A word beside every icon.
Work saves itself; anything that cannot be undone asks first, the safe answer first. AA
contrast, keyboard, 200% zoom, Reduce Motion. The API contract: no screen needs new data, so the
backend handoff documents are not touched. The student app and the website.

## Screen by screen

- **Today.** Date above the title, greeting under it, "Подготви лекција" top right. Prepared
  lessons as rows with "Започни час"; unfinished ones with "Продолжи". "Фрли" moves to the draft's
  own page.
- **Lessons.** The same rows in three groups (prepared, not finished, held).
- **Classes, Library.** Rows that open. The Library's subject filter becomes a segmented control.
- **Prepare a lesson.** One narrow form: year, material, emphasis, one button, one line of
  reassurance.
- **Editor and lesson page.** Questions on one surface: number, prompt, kind and time, options in
  two columns with the right one ticked and named, the explanation as a quiet line, "Уреди" at the
  right. "Промени ги сите прашања" is one row of four. The save bar floats at the bottom.
- **Live lesson.** No sidebar. Top bar: back, "Во живо", class and lesson, the projector button
  with its state, End. Left, the stage: where the lesson is, the question, the countdown, how many
  answered, the next step, what comes next. Right, tabs: the class, the questions, anonymous
  questions. Waiting and review use the same frame.
- **End of lesson.** The counts as one row, the attendance list with copy and print in its head,
  most missed, practice.
- **A class's results.** Six tabs: overview, attendance, lessons, topics, questions, practice. The
  speed-bonus switch moves to the class's own settings button.
- **Settings.** Rows with the control at the right; long instructions behind "Како?".
- **Help, sign-in, first run, windows.** The same language, restyled.

## Steps

One preview link a step; the owner approves each before the next starts.

0. Direction: the plan and the look (A or B).
1. Foundation and frame: tokens, type, buttons, fields, windows, the sidebar. Every screen changes
   skin at once; layouts stay.
2. Today, Lessons, Classes, Library.
3. Preparing a lesson: the form, the wait, the editor, the lesson page, the library preview.
4. The live lesson: the console in its three states, the start window, the quick question, present
   without a phone.
5. After the lesson: the end page, a class's results.
6. Settings, Help, sign-in, first run, and every loading, empty and error state.
7. Projector polish and the final gate: accessibility, 1024 to 1920 wide, 200% zoom, English, every
   test green. The website's captures of the teacher app are refreshed if the owner wants them to
   match (`scripts/site-v2-capture.mjs`).

## Rules every step follows

- Work on the branch this session was given, in one draft pull request. Vercel's GitHub
  integration builds a preview for every push
  (`teacher-aid-git-<branch>-predragkirovmks-projects.vercel.app`); that is the link the owner
  checks.
- Read `AGENTS.md`: this Next.js differs from training data; read the guide in
  `node_modules/next/dist/docs/` before writing Next code.
- A test that asserts the old design (a size, a class, a structure) is rewritten in the same step
  to assert the new one; no test is skipped. `pnpm lint`, `pnpm typecheck`, `pnpm test`,
  `pnpm build` and `pnpm test:e2e` pass before the step is shown.
- Only `/teacher` changes. Nothing under `app/(app)/`, `components/app/`, `lib/app/` or the website.
- If a step turns out to need something from the API, stop and follow the handoff rule in
  `CLAUDE.md`.
- When the direction is approved: rewrite "Simplicity first" and the token table in
  `docs/teacher-plan.md`, and record the decision in the brain (the day's note, then
  `Areas/product/prototype.md`).
