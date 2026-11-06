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

## Carried notes for later steps

- Step 4: the guide replayed from Settings returns to Settings when done or skipped (a first run
  still lands on Today). The sign-in screen has no yellow button on purpose: the provider buttons
  follow Google's and Microsoft's branding.

- Step 4 (decided by the planner): one open lesson per teacher, whatever the course. Today's one
  yellow button stays "Подготви лекција" when lessons are prepared (the yellow button keeps its
  place and meaning); while a lesson runs, the band's "Врати се на часот" takes the yellow and
  "Подготви лекција" is outlined. The reminder in the frame reads "Врати се" (one string,
  `running.here.back`).
- Step 6: for a teacher whose first run is not done, the guide's last screen leads into
  `/teacher/lessons/new` (the hands-on first lesson of F-01).
- Step 6 (from the design review of step 5): the draft page keeps the questions first and the review summary after them; replace its
  note (`draft.note.*`) with the real controls. Its Back follows `?from=` as a lesson's does. Edits not yet saved must be asked about
  before the page is left (`LeaveGuard`, with the rule `hasWork` of `lib/teacher/prepare.ts` as the model), until they save themselves.
  A single choice (one subject, one year) is a plain line ("Предмет: Математика"), never a chosen-looking row.
- Step 6 (planner, after step 5's handoff): generation becomes a job (`POST /lessons/generate`
  answers `202` with a `pending` draft; the wait polls `GET /lessons/drafts/{id}` for `ready` or
  `failed`; Cancel is `DELETE`; retry is `POST /lessons/drafts/{id}/retry`). Switch the wait,
  mock and live adapter to it; the wait view itself stays as built. Build the list of unsaved
  drafts (`GET /lessons/drafts`, latest of each chain) on Today, a pending one shown as
  "Се подготвува", so leaving the page loses nothing. Typed text gets a maximum
  (`TYPED_TEXT_MAX_CHARS` = 20 000, reason `text_too_long`). Brain spec 2.7 has the shapes.
- Step 6, the editor (planner, 2026-10-31). One model everywhere: the teacher always edits a
  draft, every change saves itself to the draft (PROPOSED `PATCH /lessons/drafts/{id}`), and the
  page's one yellow button makes it the lesson: "Зачувај лекција" for a new one (`POST /lessons`),
  "Зачувај ги промените" for a saved one. "Уреди лекција" on a lesson starts a draft from its
  current version (PROPOSED `POST /lessons/{id}/drafts`, the draft carries `lesson_id`); saving it
  is `PUT /lessons/{id}`, a new version, and consumes the draft. Unsaved drafts, new or edits,
  are listed on Today, so nothing is ever lost and nothing asks before leaving except a question
  open mid-edit.
  - The wait moves to the draft page: after `POST /lessons/generate` answers `202`, the form
    replaces itself with `/teacher/lessons/drafts/[id]`, which shows the wait while `pending`
    (polling every 2-3 s), the failure with "Обиди се повторно" when `failed`, the editor when
    `ready`. A reload carries on waiting. Cancel asks, deletes the draft and returns to the form
    filled in again (subject, year, emphasis, typed text; a document already read is reused by its
    `source_id` and shown by name, if the source is still held).
  - Questions read as they do now; each card has "Уреди", which opens that one question for
    editing (one at a time) and "Готово" closes it after checking it. Fields per kind
    (multiple choice: 2-4 options and which is right; true/false: which is right; numeric: the
    answer, the tolerance in words, an optional unit, "may be negative"), plus the explanation, the
    timer (whole seconds 5-300, a number with -5/+5 buttons) and the topic. The kind can be changed
    in edit mode, keeping the prompt. "Додај прашање" (choose the kind; up to 8), "Избриши" (down to
    5, with undo), "Нагоре"/"Надолу" buttons, never drag. Title and review summary are editable.
  - Refinements: one row, "Промени ги сите прашања", with the four (Полесни, Потешки, Повеќе
    прашања, Пократко време). Each is a job with the same wait inline; afterwards one line says what
    changed with "Врати ги претходните прашања" (the earlier draft stays readable, BR-LES-08).
  - Saving: problems are listed in plain words above the yellow button, each a link that opens its
    question. A save lands on the lesson page with a line that it is saved and will be on Today.
    The lesson page gets "Уреди лекција" (outlined); the card keeps "Отвори".
  - Today lists unfinished drafts below the prepared lessons (changed in the design review of step 6: with a few forgotten drafts above
    them the lesson of the day was off the first screen of a laptop): title (or "Се подготвува" while pending, "Не успеа" when failed),
    subject and year, "Продолжи" (a ready draft) or "Отвори" (one being written, or failed), and "Фрли" with a question.
  - The page's one yellow button and the save status are a bar that stays at the bottom of the window (design review of step 6).
- Step 6 review, decided by the planner (2026-11-01): Today shows prepared lessons first and
  unfinished drafts after them; a draft being written or failed says "Отвори", a ready one
  "Продолжи". Deleting a question is one press with "Врати го прашањето"; a refinement starts at
  once with its undo as the safety; the editor's save bar stays. After Cancel the focus stays on
  "Подготви прашања".
- Step 7: once the Lessons page lists unfinished drafts, Today shows at most three of them with
  "Сите недовршени (N)" leading to that list. In the numeric question, keep the answer and the
  unit in view and put the tolerance and "may be negative" behind "Повеќе опции" (open when either
  is already set), so the common case stays short for an older teacher.
- Step 7 review (the reviewer's calls, 2026-11-01, reversible): every card has one outlined button, the way on from it, and one quiet
  underlined link, the lesser thing, the same on Today, Lessons and the Library; on a held lesson "Отвори" is the button and "Започни час" the
  link. The Lessons page is in the order of Today (prepared, not finished, held), each section with its count, the held ones in the order of when
  they were held. Every question of the app is answered with "Не, ..." (the safe one, yellow, with the focus) and "Да, ...". A line said once
  after a change (a lesson deleted, saved or copied) takes the focus. Removing a picture can be taken back.
- Step 8: the start button in "Со кој клас?" names the chosen class ("Започни со IV-1") so a
  wrong pick is visible before it is made; update the tests that rely on the label. The
  `/teacher/live/[sessionId]` placeholder is replaced by the console.
- Step 10: End replaces the demo's "Затвори го демо часот" in Settings as the way a lesson closes;
  keep the Settings control for the demo only.
- Step 8: the class view is a protected page too; a deep link drops its query. Class-view-only
  data (the live join token, the class-view snapshot) must not travel on a channel or endpoint
  students can read; propose a class-view-only channel if the spec's `session.{id}.public` is
  shared with students.
- Steps 9 and 10: anonymous question text never goes on a channel students subscribe to
  (BR-ANON-06, AC-ANON-07, OPEN-36); the class view gets it from its own channel or snapshot.
- Step 10: OPEN-08 is read as leaving a late joiner out of both sides of the share for a question
  fired before they joined (BR-PRA-07, INTERPRETATION); the mock follows that.
- Step 9, built and reviewed (2026-11-06): the panel "Прашањето сега" goes send, open, closed,
  answer shown, its yellow button always the next step; Skip asks first; the list sends any unsent
  question out of order, but not while one is open or closed and not yet shown (the list says why);
  "Брзо прашање" takes the three kinds. The ranking shares the reveal screen beside the bars (the
  planner keeps it there: the teacher talks over the reveal as long as needed). The projector sizes
  its type by the window and fills it; all it shows is full white. The roster is one line a student,
  the time only for a late join. The demo nudge fires after 90 s; the product constant
  `NUDGE_AFTER_SECONDS` is 480.
- Step 10: after the last question the panel says "Сите прашања се готови" and offers nothing yet;
  step 10 gives it the way on (to the review, then End). Between questions the class view says
  "Часот е во тек".
- Step 10 (planner, 2026-11-06, against OPEN-14): a quick question counts like any other question
  of the session: in most-missed, in the practice set under BR-PRA-01, its topic the lesson's
  title. A skipped one counts nowhere.
- Step 10, built and reviewed (2026-11-06): after the last question the yellow moves the lesson
  to the review; an early move is a quiet link that asks first. The review is one panel, "Сега на
  проекторот", like the teaching panel: what the projector shows now (one most-missed question a
  screen, worst five, then the anonymous questions three a screen), "Следно на проекторот" in
  yellow, "Претходно" quiet, the list below with that item marked; the place is kept in the browser
  under the session and both windows agree after a reload. End always asks ("Не, часот останува
  отворен" yellow with the focus, "Да, заврши го часот" outlined) and is in the reminder beside the
  way back. The end page lives at the console's address: the attendance list by surname in the
  Macedonian alphabet, copy (one line a student, `attendanceLine`, OPEN-06) and print (the list
  only), the most-missed questions, the practice set (outlined; nothing to send says so at once).
  A held lesson links to its last end page. Settings lost "Затвори го демо часот".
- Step 11: the end page's short practice completion is the model for the class results' practice
  section; the attendance statuses and their words come from the same place as the end page's.
  The spec says one screen per course (a class and a subject, FR-DASH-01, FR-DASH-05): the
  "Класови" page lists the teacher's courses (`GET /teacher/courses`) and each opens its results.
- Step 11, built and reviewed (2026-11-06): "Класови" lists the courses, the most recently taught
  first; an untaught one says so. A course's page opens with three plain tiles (lessons held, the
  share of students who come, the share of right answers), the weakest topic and one row of in-page
  links, then who comes, lessons (one result a row, each opening its end page), weak topics,
  questions, practice, leaving the app and the speed-bonus switch. Lists show five rows first;
  narrow tables become stacked rows. No text under 16px. FR-DASH-02 is not built (no cross-course
  read). The empty course's yellow stays "Оди на Денес".
- Step 12: the attendance table's headers wrap at 1280 ("Присутен/ а"); use plain column words
  that fit.
- Step 12 (owner, 2026-11-06): after the code review, a last pass over the whole app with
  ui-ux-pro-max (layout and type only) and impeccable, as the final check before the hand-over.
- Later (not v1 unless the owner asks): per-option counts on `most_missed[]` would let the review
  show the step 9 bars.
- Step 12: the projector check looks at the ranking beside the bars at 1024x768, its smallest text.
  The planner runs review-animations itself (agents cannot start that skill) over all the motion.

## Steps (one preview link per step, the owner checks each before the next starts)

Step 6 of the first plan was split in two on 2026-10-31 (the editor, then lessons and library);
the live lesson, End, class results and the final gate moved down one number.

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
6. Prepare a lesson 2, the editor: generation as a job, the draft page made editable (all three
   question kinds, title and review summary), the four refinements with undo, edits that save
   themselves, save as a lesson and edit a saved one; unfinished drafts on Today; the first-run
   guide leads into a first lesson (F-01, F-03, F-04, FR-LES-07 to -09, -14 to -22).
7. Lessons and library: the lessons list (prepared, run, unfinished), delete with confirmation, an
   image on a question (FR-LES-10, -11, -19), the school library, read and copy (F-05, FR-LIB-01
   to -04).
8. Live lesson 1: start, console plus the class view in a second window, lobby with rotating QR
   and short code, joined list, present without a phone, restore after a window closes (F-06,
   F-11).
9. Live lesson 2: fire, progress, reveal, skip, ad-hoc question, anonymous inbox, focus flags,
   nudge; the class view's question, bars, reveal and leaderboard.
10. End: End with confirmation, attendance list for e-Дневник, most-missed questions, review on the
    class view, practice set (F-10, F-12).
11. Class results: one page per class (FR-DASH-01): attendance, points over time, weak topics,
    anonymous questions, practice completion, lesson history.
12. Final gate: accessibility, design and motion review of everything, 200% zoom, projector check,
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
