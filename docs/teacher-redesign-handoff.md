# Teacher redesign: how to carry it on

This is for the session that picks the work up, whichever model runs it. It is written so that the
next step comes out the way the first three did. Read it after `CLAUDE.md` and before
`docs/teacher-redesign-plan.md`. It does not repeat them; it says how the work is actually done,
what went wrong before and what the remaining steps ask for.

## Where things stand

Read "Status" in `docs/teacher-redesign-plan.md`: it is the record. On 2026-11-14 it said: the
direction and steps 1 and 2 are approved, step 3 is built and waits for the owner. Steps 4 to 7 are
not started. Nothing after a waiting step is built until the owner approves it.

- Branch `ccr-65507c3f-cbceas` in both repositories; draft pull request #8 in the app repo and #5
  in the brain repo. Never `main`, never a merge.
- Owner's review page: https://claude.ai/artifact/GaAL6hpukNw9EnvFB3KvdJ . Its source is
  `docs/teacher-redesign/review-page/index.html`; its pictures live on the page itself.
- Preview of the branch: `https://teacher-aid-git-ccr-65507c3f-cbceas-predragkirovmks-projects.vercel.app/teacher`
  (a cloud container cannot open it; read its status from the pull request's checks).

## The first ten minutes of a session

1. Read `CLAUDE.md`, this file, the plan's Status and the "as built" section of the last step.
2. Read the owner's decisions: the `ArtifactData` tool, `action: "list"`, `collection:
   "decisions"`, the review page's URL. A record looks like `{at, choice: "approved" | "changes",
   note}` under `decisions/step-N`. This is the only place an approval lives. A "go" in the chat
   means "carry on with what is approved", not "step N is approved".
3. `git status` and `git log --oneline | head` in both repositories; look at the pull request's
   checks. Start from a clean tree and a green head.
4. If the last step is approved: record the approval (plan Status, brain notes), then start the
   next step. If it was sent back: read the note, fix exactly that, show the step again. If there
   is no decision: do not build. Say so in one line and set a check (see "Waiting").

## How one step is done

The order matters. Each line is something that was learned by getting it wrong once.

1. **Read before changing.** The step's lines in the plan ("Screen by screen"), the components,
   and the tests of those screens. The tests are the screens' promises in plain words.
2. **Take the "before" pictures first**, while the old build is the one being served:
   `node scripts/teacher-redesign/step-shots.mjs <dir> 1280 800 1` after editing its list of
   screens to this step's screens. Look at them. Measure page heights (the script prints them).
3. **Build the step whole**: components and `app/(teacher)/teacher.css`, through the tokens.
   Keep markup, names, words and flows unless the plan's line for the step is about them.
4. **Rebuild, capture, look.** Laptop (1280 x 800), phone (390 x 844), tablet (820 x 1180), 1024
   wide, and the states the walk does not reach: empty, loading, error, a dialog open, English.
   A picture you have not opened is not checked.
5. **Run the whole teacher project** (commands below). Then for every failing test decide which of
   two things it is, and say which in the notes:
   - it **describes the old look** (a card where there is now a row, a size, a position): rewrite
     it to describe the new one, as strictly as before;
   - it **holds a decision** (what comes first on a page, where the keyboard goes, what fits in the
     first screen, what is never hidden): the test is right and the design changes.
   In step 3 the row "Промени ги сите прашања" was moved above the questions; four tests said
   nothing but the lesson's name stands in front of the first question. The row went back. No
   test was edited. That is the expected outcome more often than it feels like.
6. **Never** skip, delete or loosen a test. A test that fails once has a cause: find it. (A
   timeout on an untouched screen while a capture script was hammering the same server was load,
   proved by running that spec alone. Do not run captures during a test run.)
7. **All checks**, in this order: `pnpm lint`, `pnpm typecheck`, `pnpm test`, the build, the
   teacher project, then the typed-code build with `live-code.spec.ts` (below).
8. **Commit small, push, wait for CI** on the pull request's head (about 22 minutes for
   "End-to-end (mock)"). Red CI is fixed at its root.
9. **Show it**: pictures, the review page, the pull request's body, the plan, the brain. Then read
   the decision store before writing "waiting".

## Commands (cloud container)

    # build and serve what the tests run against (rebuild after every change)
    (pkill -f "next start -p 3100" || true)
    NEXT_TELEMETRY_DISABLED=1 NEXT_PUBLIC_E2E=1 pnpm exec next build
    (nohup pnpm exec next start -p 3100 > /tmp/server.log 2>&1 &)

    # the whole teacher project, about 12 minutes; run it in the background and read the log
    E2E_SKIP_BUILD=1 pnpm exec playwright test -c scripts/teacher-redesign/playwright.cloud.config.ts \
      --project=teacher --workers=3 --reporter=line > /tmp/run.log 2>&1
    # progress and failures
    tr '\r' '\n' < /tmp/run.log | grep -a "^\[[0-9]*/" | tail -1
    tr '\r' '\n' < /tmp/run.log | sed 's/\x1b\[[0-9;]*[A-Za-z]//g' | grep -a -E "^  [0-9]+\) |^  [0-9]+ (passed|failed|skipped)" | sort -u

    # one spec while working
    E2E_SKIP_BUILD=1 pnpm exec playwright test -c scripts/teacher-redesign/playwright.cloud.config.ts \
      --project=teacher tests/e2e/teacher/live.spec.ts --workers=3 --reporter=line

    # the four tests that need their own build (they show as "4 skipped" in the normal run)
    NEXT_PUBLIC_E2E=1 NEXT_PUBLIC_STUDENTS_CAN_TYPE_CODE=1 pnpm exec next build
    (NEXT_PUBLIC_STUDENTS_CAN_TYPE_CODE=1 nohup pnpm exec next start -p 3100 > /tmp/server.log 2>&1 &)
    NEXT_PUBLIC_STUDENTS_CAN_TYPE_CODE=1 E2E_SKIP_BUILD=1 pnpm exec playwright test \
      -c scripts/teacher-redesign/playwright.cloud.config.ts --project=teacher tests/e2e/teacher/live-code.spec.ts

Expected on a good run: 516 passed, 4 skipped (520 in all, 2026-11-14), and 4 passed for the
typed-code build. Unit tests: 1,536.

Things the container does:

- A worker restart kills the server and any background run. Before a capture or a test run,
  `curl -s -o /dev/null -w "%{http_code}" localhost:3100/teacher/sign-in`; if it is not 200,
  start the server again.
- A long foreground `sleep` is refused. Wait with a background command that exits when the thing
  is done (`until ! pgrep -f "playwright test" > /dev/null; do sleep 5; done`), not by polling.
- Use the scratchpad for logs and pictures, not the repository.
- The demo teacher is Марија Петровска. A page opened by a script needs
  `localStorage["teacheraid-teacher-session-v1"] = '{"persona":"veteran"}'`; `"novice"` lands in
  the welcome guide ("Прескокни" leaves it).

## Pictures of an old build

Only with a clean tree (everything committed):

    git checkout -q <old-sha> -- app components lib      # the build of the last approved step
    # build, serve, node scripts/teacher-redesign/step-shots.mjs <before-dir> 1280 800 2 ; and 390 844 2
    git checkout -q HEAD -- app components lib            # back; check `git status` is clean
    # build, serve, the same two runs into <after-dir>

`python3 scripts/teacher-redesign/to-webp.py <png> <webp> [phone]` makes the review page's sizes
(1920 x 1200 for a laptop, 585 x 1266 for a phone). Name them `img/sN-before-<key>.webp` and
`img/sN-after-<key>.webp`.

## The review page

The owner decides there, so it has to be right, short and true.

- Edit `docs/teacher-redesign/review-page/index.html`. For a new step: copy the newest step's
  `<section id="step-N-review">` above itself and change it; move the one "Open the preview" bar
  into the new section; the old section's eyebrow says "approved" with its date; in the list of
  steps the old one gets `data-status="done"` and the chip "Approved", the new one
  `data-status="review"` and "Ready for your review"; the hero's three points, the top chip, the
  footer date; and in the script, the `paint` branch that sets the top chip names the new step.
  The decision box is `data-for="step-N"` with ids `note-step-N`, `approve-step-N`,
  `changes-step-N`.
- Six pairs at the most: the screens that changed most, one on a phone. Each caption says what
  changed and what did not, in the owner's words, with the Macedonian names of buttons as they
  are on screen. Numbers are measured ("3,921 px before, 2,611 px now"), never rounded up.
- Check it: copy the file and its `img` folder to a scratch folder, then
  `node scripts/teacher-redesign/review-page-check.mjs <folder> step-N-review`. Overflow 0,
  errors 0, and open both pictures.
- Publish with the `Artifact` tool: `file_path` the scratch copy of `index.html`, `url` the page,
  `root` the scratch folder, `files` the new `img/...` paths only (files left out are kept), a
  short `label`. No `icon`, no `capabilities`. In a new session the tool asks for a read of the
  page first (`action: "read"`); build on what it returns if it differs from the file here.
- Commit the changed `index.html` to the repository in the same step.

## Records, every time a step is shown

- `docs/teacher-redesign-plan.md`: a dated Status line, and "Step N as built" (what changed, what
  did not, what was measured, any library added, tests rewritten and why).
- `docs/teacher-plan.md`: where an older rule now reads differently, a dated "(Revised ...)" note
  beside it. Do not delete the old rule.
- The pull request's body: which steps are approved, which waits, the checks.
- The brain repository (`/home/user/teacher-aid-brain`, its own `CLAUDE.md` applies: English,
  Cyrillic for real names, no emojis, numbers measured or marked `(verify)`): the day's note
  `Daily/YYYY-MM-DD.md` and `Areas/product/teacher-app-redesign.md` (Status line and "Step N as
  built"). Commit and push it too.
- If a step changes what the API must provide, both backend handoff documents in the brain, the
  same session. Steps 1 to 3 changed nothing there. Step 5 might (see below).

## Waiting for the owner

A decision on the page does not wake the session. After showing a step: read the store; if it is
empty, schedule a check with `send_later` (50 minutes apart for the first six, then every four
hours; nothing between 22:00 and 06:00 UTC except one check at 06:00). Carry the count of empty
checks in the message. Delete the scheduled check when the decision arrives. Be sparing: the owner
watches their usage.

## Talking to the owner

Short and plain. What was built, what it looks like now, the review link, the true state of the
checks, what you need from them. No tool names, no file paths unless asked, no celebration. If
something failed or was undone, say so in a sentence. They read on a phone.

## The remaining steps

For each: the plan's lines ("Screen by screen" in `docs/teacher-redesign-plan.md`) are the brief.
What follows is where to look and what to be careful of.

### Step 4: the live lesson

The biggest step, and the screen a teacher uses in front of a class. Plan: no sidebar; a top bar
(back, "Во живо", class and lesson, the projector button with its state, End); the stage at the
left (where the lesson is, the question, the countdown, how many answered, the next step, what
comes next); tabs at the right (the class, the questions, anonymous questions); waiting and review
use the same frame. Also the start window, the quick question and "present without a phone".

- Code: `LiveConsole.tsx`, `QuestionPanel.tsx`, `QuestionList.tsx`, `LiveRoster.tsx`,
  `AnonInbox.tsx`, `ReviewPanel.tsx`, `ProjectorControl.tsx`, `EndLesson.tsx`, `StartDialog.tsx`,
  `AdhocDialog.tsx`, `RunningBand.tsx`, the route `app/(teacher)/teacher/(shell)/live`.
- Tests: `live.spec.ts` (the largest), `questions.spec.ts`, `running.spec.ts`, `live-code.spec.ts`,
  `a11y.spec.ts`. Helpers in `live-helpers.ts`; the clock is fixed, move it.
- The measure of success is the plan's fifth principle: **the live lesson fits one screen** at
  1280 x 720 and 1024 wide; the question and the one next step never move as the state changes.
- Yellow is the live colour and belongs here. Red only for End. One main button, in the stage.
- Tabs are the first place a headless library may earn its keep (keyboard arrows, roles, focus).
  If one is added, name it in the step's notes and keep its look in the tokens. Hand-written
  `role="tablist"` done fully is also fine. Nothing may be reachable only through a tab that hides
  a warning: a new anonymous question or a student who left must show on the tab itself, in words
  or a count, not only as a colour.
- Removing the sidebar on this route changes how a teacher leaves a live lesson: "back" must keep
  the lesson running and the yellow band must still bring them back. The tests about the band
  (`running.spec.ts`) hold decisions; read them first.
- **Do not touch `.cv`**, the projected view. Compare its captures before and after, pixel for
  pixel (`scripts/teacher-capture.mjs` walks a live lesson).
- Nothing new is asked of the API if every count and list stays what it is. If a tab needs a
  number the snapshot does not carry, that is an API change: stop and record it in the handoff
  documents rather than deriving it from mock data.

### Step 5: after the lesson

The end page and a class's results. Plan: the counts as one row, the attendance list with copy
and print in its head, most missed, practice. A class's results as six tabs (overview,
attendance, lessons, topics, questions, practice); the speed-bonus switch moves to the class's own
settings button.

- Code: `EndPage.tsx`, `ClassResults.tsx`, `ClassReview.tsx`, `ClassQuestion.tsx`,
  `ClassesPage.tsx`. Tests: `end.spec.ts`, `classes.spec.ts`.
- Reuse the tabs of step 4. A tab's address should survive a reload (the tests may already hold a
  section's link; keep every existing link working).
- Printing and copying the attendance list are features with tests; they stay one press away.
- Moving the speed-bonus switch is a move of a control, not a change of rule. If the place it
  moves to needs a call the API does not have, record it in the backend handoff documents.

### Step 6: Settings, Help, sign-in, first run, and every loading, empty and error state

- Code: the `settings` and `help` routes, `SignIn.tsx`, `DemoSignInSheet.tsx`, `Guide.tsx`,
  `GuideCard.tsx`, `InstallCard.tsx`, `Skeleton.tsx`, `LoadProblem.tsx`, `Problem.tsx`,
  `StateLine.tsx`, `ConfirmDialog.tsx`. Tests: `signin.spec.ts`, `shell.spec.ts`,
  `offline.spec.ts`, and the settings tests.
- Settings: rows with the control at the right; long instructions behind "Како?" (a disclosure
  that is a real button, open state said in words).
- Walk every state on purpose: no lessons, no classes, the API failing, offline, a slow load, a
  session that ended. Each says what happened and offers one way on.
- If the manifest, the offline page or icons change, edit the header comment of
  `public/teacher-sw.js`.

### Step 7: the projector and the final gate

- The projector (`ClassView.tsx`, `.cv` in the stylesheet, `projector-sizes.spec.ts`) is its own
  dark world, read from the back of a room. This is the one step allowed to change it. Polish, do
  not redesign: sizes are asserted for a reason.
- The gate: axe clean on every screen, 1024 to 1920 wide, 200% zoom, English from first screen to
  last, Windows high contrast, reduced motion, every test green, CI green.
- Ask the owner whether the website's pictures of the teacher app should be refreshed
  (`scripts/site-v2-capture.mjs`); that is outside the teacher app's fence, so only on their word.
- At the end: the plan's Status says the redesign is complete, the pull request leaves draft only
  when the owner says so, and nothing is merged by the session.

## Rules that are easy to forget

- One main button a screen (deep teal, 48px). Yellow means live. Text never under 16px and never
  dimmed with opacity (axe measures what is painted; use the ink tokens).
- Colour is never the only sign: a state has a word, an icon or an edge as well.
- Compare heights with `tall()`, not raw floats.
- Words: do not reword what works. A new string goes in `lib/teacher/i18n.ts`, Macedonian first,
  English second.
- Only `app/(teacher)`, `components/teacher`, `lib/teacher`, their tests and docs. Not
  `components/app/Mark.tsx`.
- No secrets, no personal details, no model names in anything pushed.
- Do not end a turn with uncommitted or unpushed work; do not push work that is known to be red.
