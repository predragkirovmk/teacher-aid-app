# TeacherAid teacher app: v1 build plan

Started 2026-10-28. The teacher side ("desktop app") of TeacherAid: an installable web app at
`/teacher` that teachers and professors run from a school laptop. The backend is not built, so
every screen is written against the API contract in the spec and runs on mock data until the API
exists.

Source of truth for behaviour and data: the backend spec
`~/Desktop/teacher-aid-brain/Areas/product/backend-handoff/backend-spec-for-agents.md`
(sections 1.9, 2, 3, 4, 5 F-01 to F-12, 7, 8, 11.1). The owner's decisions below override it
where they differ.

## Owner decisions (2026-10-27, do not re-ask)

- Installable web app at `/teacher`, branch `teacher-v1` off `main`. The student app (`/app`)
  and the website are not touched.
- Colours come from the owner's desktop screens (`~/Desktop/desktop screens ta/`); their layouts
  are not the design. Teal is for the teacher app only; students stay blue and yellow.
- v1 scope: lesson prep, live lesson (console plus projected class view, End), class results.
  School admin is out.
- No timetable. "Today" lists prepared lessons, as the spec says.
- Red only for warnings and End, never for wrong answers.
- Students are "ученици" in a secondary school and "студенти" at a university; a class is
  "клас" or "група" in the same way. Set once per school.
- Not built: messages, feedback, notifications bell, search bar (all in the screens, none in the
  spec). Student questions arrive in the anonymous inbox.
- Buttons use the short imperative ("Подготви лекција", "Зачувај"); sentences use "Вие".
- A question fired before a student joined is not counted as missed for that student, in the
  practice set or in topic results (OPEN-08, planner's call, reversible).

## Simplicity first

The users include older teachers who are not comfortable with computers. Every screen passes these:

- Body text 18px or larger; nothing under 16px. Titles large and plain.
- Buttons and rows at least 56px tall (48px for small secondary ones), always a word next to an
  icon, never an icon alone.
- One yellow button per screen: the main action, named for what it does ("Подготви лекција").
- The sidebar is always visible on a laptop, with four labelled destinations. Nothing hidden
  behind hover, right-click, drag, double-click or keyboard shortcuts; shortcuts may exist as an
  extra, never as the only way.
- Every screen has a plain title saying where you are. Deep screens have a labelled Back.
- Anything that cannot be undone asks first, in plain words, with the safe choice as the default.
  Work saves itself.
- Plain Macedonian, no jargon ("лекција", "час", not "сесија", "конзола").
- Polite form ("Вие") for teachers.
- Works at 1280x720 and 1920x1080, down to 1024 wide; text reflows at 200% zoom.

## Design tokens (teacher app only)

| Token | Value | Use |
|---|---|---|
| `--deep` | `#124554` | Sidebar, darkest panels |
| `--panel` | `#145667` | Cards, bands, inputs' surround |
| `--ground-top` | `#155869` | Page ground, top of the gradient |
| `--ground` | `#32878C` | Page ground, body |
| `--shadow` | `#0A2E37` | Deepest shade, overlays |
| `--yellow` | `#FFC83E` | The one primary button; the live lesson |
| `--yellow-deep` | `#CEA034` | Yellow pressed, yellow patterns |
| `--red` | `#EC221F` | Warnings and End only |
| `--text` | `#FFFFFF` | Text on teal |
| `--ink` | `#0A2E37` | Text on yellow (white on yellow fails contrast) |

Contrast: white on `--ground` is about 4.2:1, so only large text (24px, or 19px bold) sits on the
ground; normal text sits on `--panel` or `--deep`. White on `--red` is about 4.4:1: red buttons
use 19px bold or larger. Right and wrong are never shown by colour alone (icon plus word).

Type: Golos Text for titles and numbers, the system font for body. Icons: Phosphor, regular
weight, filled for the selected sidebar item. Spacing on the 8pt grid. Focus ring 3px yellow,
offset 2px. Motion only where something changed, short (under 250ms), Reduce Motion respected.
The app is dark teal only (no light mode).

## Code layout

- Route group `app/(teacher)/` with its own root layout and `teacher.css`; pages under
  `app/(teacher)/teacher/`.
- Components in `components/teacher/`, logic and copy in `lib/teacher/`. Every string in
  `lib/teacher/i18n.ts`, Macedonian first, English second.
- Shared code (`lib/brand.ts`, `components/app/Mark.tsx`) is imported, not changed. Nothing under
  `app/(app)/`, `components/app/`, `lib/app/` or the website is modified.

## Steps (one preview link per step, the owner checks each before the next starts)

1. Foundation: route group, teal tokens, logo, sidebar and top bar shell, MK/EN switch, school-type
   wording, installable manifest and icons, placeholder pages with honest empty states.
2. Data and safety net: typed teacher API contract (spec 3, 11.1), mock adapter with a demo
   school, hooks for screens, error codes mapped to MK/EN copy; Vitest and Playwright smoke tests,
   CI (lint, typecheck, build, tests).
3. Sign-in and first run: Google and Microsoft buttons (demo sheet in mock mode), not-invited and
   signed-out states, the guided first lesson (F-01, `first_run_done`).
4. Home ("Денес"): prepared lessons not yet run, the "a lesson is running" banner, the main
   button to prepare a lesson.
5. Prepare a lesson 1: class and subject, upload PDF or Word or type sentences, emphasis line,
   the wait while the AI writes, failure states (F-03, BR-LES-05).
6. Prepare a lesson 2: review and edit questions (all three kinds), four refinements, save as a
   version; lessons list; school library and copy (F-04, F-05).
7. Live lesson 1: start, console plus the class view in a second window, lobby with rotating QR
   and short code, joined list, present without a phone, restore after a window closes (F-06,
   F-11).
8. Live lesson 2: fire, progress, reveal, skip, ad-hoc question, anonymous inbox, focus flags,
   nudge; the class view's question, bars, reveal and leaderboard.
9. End: End with confirmation, attendance list for e-Дневник, most-missed questions, review on the
   class view, practice set (F-10, F-12).
10. Class results: one page per class (FR-DASH-01): attendance, points over time, weak topics,
    anonymous questions, practice completion, lesson history.
11. Final gate: accessibility, design and motion review of everything, 200% zoom, projector check,
    text hygiene, code review, backend handoff.

## Rules every step follows

- Work only in `/Users/pedza/Desktop/teacher-aid-app-teacher` on branch `teacher-v1`. Never touch
  `~/Desktop/teacher-aid-app` (main checkout) or other worktrees. Do not push or merge.
- Read `AGENTS.md`: this Next.js (16.3) differs from training data; read the relevant guide in
  `node_modules/next/dist/docs/` before writing Next code.
- Match surrounding code style and comment density (see `app/(app)/` and `lib/app/` for the house
  style). No backwards-compatibility shims.
- Small focused commits; end each message with the `Co-Authored-By` line for the model that wrote
  it, for example `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Before finishing: `pnpm lint`, `pnpm exec next typegen && pnpm exec tsc --noEmit`, `pnpm build`,
  `pnpm test` and `pnpm test:e2e` must pass.
- Preview: commit everything, then run `vercel deploy --yes` from the worktree (project linked in
  `.vercel/`). Verify on the https preview (a production build over http://localhost is unstyled
  because of the CSP).
- Design review after each build: a reviewer checks the preview with impeccable, ui-ux-pro-max
  (layout and type only, colours are fixed), apple-design, platform-design-web,
  design:accessibility-review and review-animations, against the simplicity rules above, and fixes
  what it finds before the owner sees the link.
- Backend handoff: if a step changes what the API must provide (a new field, endpoint, event, rule
  or state), write it to `docs/handoff-pending-<step>.md` and commit it; the planner applies it to
  both handoff documents in the brain.
- Ask nothing; where a product decision is open (an OPEN-xx item), pick the spec's suggested
  default or the most reversible option and list it under "Decisions taken".

## Report format (final message of each agent)

Preview URL, deep links, commits (hash and subject), decisions taken, handoff notes, what was
verified and how, anything left undone.
