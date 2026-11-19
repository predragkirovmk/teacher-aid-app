# The student app made simple

The owner's request, 2026-11-19, in short:
- **Home** shows only practice (the yellow button at the top), the last quizzes, and the documents teachers send. No attendance, no next test, nothing else.
- **Subjects** is gone from the app, and its tab goes with it.
- **Notifications** move to the top right, and their tab goes.
- **Profile** loses documents, attendance and the last quiz.
- **Scan:** the QR scanner is a screen of its own, opened by a "Scan to join" call to action that is fun and animated, one you want to tap.
- **The feel** built in the motion work stays: the springs, the crossfade, the calm arrivals, the rewards.

Branch `student-simple` off main 13ed637 (the motion work merged), one draft pull request. The work goes in two batches,
and the owner gets a test link after each.

The plan was approved by the planner on 2026-11-19, as the owner asked ("write yourself a plan and approve it yourself").

## Rules this work keeps

- Students stay blue and yellow. Use the tokens and the house parts that exist (`.card`, `.tile`, `.next`, `.item`,
  `ResultRow`, `SegGlide`, the press primitive, `.rise`, the spring tokens). Write no raw colour or size where a token exists.
- The feel from docs/mobile-motion-steps.md is frozen:
  - A tab tap always crossfades.
  - Forward and Back slide.
  - Arrivals rise 8 px.
  - The tab piece merges and slides.
  - Rewards and haptics stay as they are.
  - Reduced motion leaves short fades.
- Everything moves with transform and opacity only.
- The student app's added JavaScript stays at or under today's size. Cutting should make it smaller.
- Copy is Macedonian first and English second, both in `lib/app/i18n.ts`, in plain words with no exclamation and no emoji.
  Reuse an existing key wherever one says the thing. Remove the keys nothing uses any more, from both languages.
- Tests that described the old screens are rewritten to describe the new ones in the same change, never skipped or
  weakened. A test for a screen that no longer exists is deleted with the screen.
- Checks before every push: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm test:e2e` on a free port.
  CI must be green on the head.
- Stay out of the teacher app, the website and `components/app/Mark.tsx`.

## Part 1: how it looks

### The tab bar: three slots

`[ Home ]  [ Scan to join ]  [ Profile ]`

- **Grid.** The grid becomes `1fr auto 1fr`.
- **Tabs.** Home and Profile are tabs. The white `SegGlide` piece slides between them over the middle, and it never sits
  under the middle. The tab crossfade works as it does now.
- **The middle.** It is a yellow pill, wider than today's round scan button: a QR glyph plus "Скенирај за влез" (EN "Scan
  to join"). It is the call to action of the whole app.
- **Idle motion** (batch 2), all of it transform and opacity on the compositor:
  - a shine that sweeps across the pill;
  - the QR glyph's corners breathing in and out;
  - a soft halo ring that pulses out behind the pill.

  They play together for about 1.2 s, then rest about 3.3 s, then repeat, so the pill keeps calling without buzzing all
  the time.
- **Press.** A press squashes the pill to 0.92, and the release pops it back on `--spring-big`. It is bigger than an
  ordinary press, because this is the app's main action.
- **Reduced motion:** no idle motion at all; the press is the 0.8 dim.
- **Where the pill shows.** The dock is hidden in the quiz, practice, scan and welcome, so the pill never moves during a
  lesson.

### Home

From the top:

1. **The header row.**
   - **Left:** the Mark, as today.
   - **Right:** a bell button (`BellSimpleIcon`) in place of the avatar, since the avatar's Profile link is the tab now.
     It has a 44 px touch target, and a yellow badge with the unread count in the same style as today's tab badge.
     It opens Alerts.
   - **Under the row:** the date line and the greeting `h1`, as today. The demo clock pill stays only if something left
     on the screen still depends on the demo time.
2. **Practice: the yellow card at the top.** It uses the `.next` look (the big yellow card) with "Вежбање" as its title.
   - **Line under the title:** what waits, from the existing `pr.home.*` copy ("Ново · Математика", "2 нови",
     "Продолжи · Физика").
   - **The button:** a dark pill, like today's "Скенирај за присуство", reading "Започни" or "Продолжи".
   - **Where a tap goes:** one waiting set opens that set, and more than one opens the list.
   - **With nothing waiting:** the card still shows, quieter, with a line that says so ("Нема нови вежби"). It opens the
     list, where the done sets can be done again.
3. **The last quizzes.** A section title, "Последни квизови", then the three newest results as `ResultRow` rows
   (subject mark, lesson, score, "New" tag), with "Сите резултати" under them, going to `/app/summary`. Before any
   result exists, one quiet line says there is none yet.
4. **From your teachers.**
   - A section title, "Документи" with the sub line "Материјали од твоите наставници" (the existing `docs.*` copy).
   - Then the newest three documents as rows (an icon, the title, and the type, "PDF").
   - "Сите документи" goes to `/app/documents` when there are more than three.
   - A tap on a document does what the documents screen does today (the demo toast) until downloads are connected.

The section titles and rows arrive with the calm rise, once per session, as Home does today.

### Profile

As today, minus three things:
- the attendance tile;
- the last quiz tile;
- the Documents row.

Achievements, Install, Settings, Language, FAQ, Data, Privacy, Terms and Log out stay, along with the editor.

### Alerts

`/app/notifications` stops being a tab root and becomes an ordinary screen.
- **Header:** `Top` with Back on the left, and the large title kept.
- **Content:** the list, "Mark all as read" and the paging stay. The detail screen stays.
- **Getting there:** it opens from the bell with the forward slide, and Back returns to where the bell was tapped.

### Scan (batch 2)

`/app/scan` stays a full screen with no tab bar.
- **The way in:** it opens from the pill with the forward slide. The corners of its frame snap in on `--spring-pop`.
- **Added:** a "Внеси код" button (EN "Enter the code") under the camera. It opens a small field (placeholder
  "MATH-7B") that sends the code through the same `startJoin`, so a student with no camera, or who prefers to type, can
  still join.
- **Access:** the camera region is labelled; focus order runs title, camera, upload, enter code; everything works with
  the keyboard.

## Part 2: what comes out

| Goes | What it means in code |
|---|---|
| Subjects tab and screens | Delete `app/(app)/app/subjects/page.tsx` and `app/(app)/app/subject/[id]/page.tsx`, plus `SubjectHistory.tsx`, `TopicChart.tsx`, `lib/app/topics.ts` and its test. From `SubjectCard.tsx`, delete `SubjectCard`, `SubjectRow` and `useSubjectMorph`; `SubjectMark` stays for `ResultRow`. Delete `TabTapContext` once nothing reads it, but keep the Shell's own tap memory, because the crossfade depends on it. `lib/app/subjects.ts` stays (names, marks, the quiz glyph). |
| Alerts tab | Remove it from the Dock. The badge moves to the bell. The `aria-live` "arrived" message moves with it. |
| Home: next lesson card, next test, leaderboard, attendance, timetable | Delete them, with their hooks and CSS where nothing else uses them. |
| Profile: attendance tile, last quiz tile, Documents row | Delete them. |
| Attendance screen | Delete it; with the tiles gone, nothing in the app leads to it. Joining a lesson still records attendance on the server (joining is the check-in). The "marked late" alert opens its own alert detail instead. |
| Leaderboard screen | Delete it; its only ways in were the Home tile and the Subjects index. The in-quiz standings stay. |
| Schedule screen and the demo timetable | Delete them; their only ways in were the next test tile and the timetable. Keep `lib/app/demo/schedule.ts` only if the demo clock or the quiz still need it. |
| Links into removed screens | Retarget them. In `lib/app/alerts.ts`, `toSubject` and the attendance target go to the alert's own detail, and practice with no set goes to `/app/practice`. Make the same change in the `public/app-push.js` `deepLink` mirror and its unit test. In `PushRunner.tsx` and `public/app-sw.js`, keep falling back to `/app/notifications`. Remove the cut routes from `lib/app/offline-cache.ts`, `lib/app/demo/index.ts` `demoRoutes` and the `calmScreen` list in `lib/app/push/ask.ts`. |
| Copy | Remove the keys nothing reads (en and mk together). `tests/unit/copy.test.ts` keeps them in step. |
| Capture tools | Remove the cut states from `tests/capture/student-screens.mjs` (09, 10, 11, 12, 14, 44 becomes a pushed screen, and 55 needs another route) and from `student-perf.mjs` (the tab tap and swipe over two roots; drop "subject open and back", or point it at a result). |

`/app/summary` (the list of results), `/app/practice`, `/app/documents`, `/app/achievements` and `/app/qr-kit` stay.
They are reached from Home, the Practice card, Profile and Settings.

## Part 3: how it works

- **Tabs.** `TAB_ORDER = ["/app", "/app/profile"]`. A swipe on Home goes to Profile and back, with its speed handoff. The
  Shell's `shown` and `chosen` map those two paths. Alerts, Results, Documents and the rest are pushed screens with Back.
- **The bell.**
  - **What it reads:** the same `useNotifications` unread count as today's tab badge, with the "30+" cap, and the same
    screen-reader text.
  - **Opening:** a `Link` to `/app/notifications` with the `nav-forward` type, so it slides.
  - **When it goes:** the badge clears as alerts are read, as today.
- **Practice card.**
  - **Data:** `usePracticeSets` and `practiceStatus`, read the way `PracticeHomeRow` reads them now.
  - **Where it goes:** one waiting set opens `/app/practice/<id>`; otherwise it opens `/app/practice`.
  - **Live:** it works in live mode as well; the card does not depend on the demo.
- **The last quizzes.** `useResults()`, newest first, first three. Each row opens `/app/summary/<sessionId>`, and the
  "New" tag comes from the unread `result_ready` alert, as the Home tile does today. Works live.
- **Documents.**
  - **Demo:** demo mode uses today's `DEMO_DOCS`.
  - **Live:** documents are not in the API yet (OPEN-18), so live mode hides the section. This keeps Home honest
    rather than showing fake data.
  - **The API change:** batch 2 writes what the API must provide into both backend handoff documents in the brain, per
    `CLAUDE.md`. That is a list of documents a teacher sent to the student's class: id, title, subject, teacher, sent
    at, type, size and a download URL. The same edit also records that the student app no longer reads the leaderboard,
    topics or attendance view.
- **Scan to join.**
  - **Joining:** the pill is a `Link` to `/app/scan` with `nav-forward`.
  - **Typing a code:** the "Enter the code" field runs `interpretCode` on what was typed, then `startJoin`, the same path
    a camera scan takes. A bad code shows the same `Miss` sheet.
  - **The idle loop:** one CSS animation with steps in its keyframes, so there is no timer. It respects
    `prefers-reduced-motion`. The browser pauses it in a hidden tab.

## The batches

### Batch 1: the cuts and the new tab bar

1. The Dock gets three slots: Home, today's round scan button, and Profile. The pill and its motion come in batch 2.
   - `TAB_ORDER` becomes the two roots.
   - The bell goes top right on Home, with the badge and the live message.
   - Alerts becomes a pushed screen with Back.
2. The Subjects tab, its screens and its components come out, and their links are retargeted (Part 2).
3. Home is cut to the header with the bell, the Practice row and the last quiz tile, so the cuts can be tried before the
   new layout.
4. Profile is cut.
5. The attendance, leaderboard and schedule screens are deleted, and the links into them are retargeted.
6. Copy, CSS, capture tools and tests are brought into line.
7. The checks run, then the push, then CI, then the owner gets the test link.

Builders: two runs in turn. The first does items 1 and 2, the second items 3 to 6. Then a reviewer.

### Batch 2: the new Home and Scan to join

1. The Home layout from Part 1: the Practice yellow card at the top, the last quizzes, and the documents. With it come
   their motion, live mode and tests.
2. The "Scan to join" pill in the dock, with its idle motion and its press. The scan screen gets "Enter the code" and
   its access fixes.
3. The backend handoff documents in the brain.
4. Review, perf at 4x CPU, JS against batch 1, the after pictures. Then the push and the link.

Builders: two runs in turn. The first does item 1, the second items 2 and 3. Then a reviewer, then the planner's check.

## Record

(each batch adds its line here)

- **Batch 1, 2026-11-19.** Two builders. Done: three tabs (Home, the scan, Profile; `TAB_ORDER` is the two roots, the
  bell with its badge and live message on Home, Alerts a pushed screen with Back); the dock grid is now `1fr auto 1fr`,
  so the scan sits in the exact middle and the piece never sits under it; Subjects, its screens, chart, history, morph and
  `topics.ts` are gone. Cut: Home keeps the header (Mark, bell, date, greeting), the Practice row and the last quiz tile;
  Profile loses the attendance tile, the last quiz tile and the Documents row; the attendance, leaderboard and schedule
  screens are deleted, with `tween.ts`, the hooks `useStandings`, `useAttendanceView`, `useLeaderboard`, `useTopics`,
  `useScans` and `roomLabel`, 54 copy keys (en and mk), and the CSS of the cut cards (`.t-num`, `.ring`, `.item--me`,
  `.tile-word`, `.section-row`, `.section-link`, `.mark-line`, `.pill--now`, `.tile-big.counting`, the timed list).
  Kept on purpose: `.next` and its children (batch 2's Practice card), the API client methods and the mock's attendance
  and leaderboard (the teacher app and mocks read them), `/app/documents`, and the demo clock pill, since Home's date and
  greeting still follow the demo time and the pill is the only sign of it. `lib/app/demo/schedule.ts` stays for
  `demoTime`, `CLOCKS` and `currentLesson` (the mock's check-in time and Settings' `ClockOptions`); its room, register,
  next-lesson and next-test helpers went with their tests. Retargeted: the `marked_late` alert and its push link in
  `public/app-push.js` open the alert's own detail (`notif.open.attendance` removed); the cut routes left
  `offline-cache.ts` (`demoRoutes` and `calmScreen` named none). Privacy copy untouched: it names no screen that is gone
  (the server still records attendance when a student joins). Tests: specs that read attendance or points off the cut
  screens now read the mock store's check-ins and points; Home and Profile specs, the live spec (Home no longer asks the
  API for the leaderboard or attendance) and the tab bar's stretch check (1.4 tabs, since a tab is now wider) were
  rewritten; the schedule, attendance and leaderboard checks went with their screens. Checks: lint, types, 1570 unit,
  `pnpm build`, mock and teacher e2e (753 passed, two failures of my own fixed and re-run green), live e2e 89 of 89. JS
  (gzip, from `js-size.json`): all screens 431,536 and Home's first load 302,964, from 483,581 and 338,255 at the end of
  the motion work. Review of batch 1: the bell's accessible name now carries the unread count (its aria-label had hidden it), the tab bar's stretch check says the piece reaches a quarter tab into both Home and Profile at once (measured: it spans 1.6 tabs, not 1.4), the mark-all alert test waits for the slide to finish, and the dead `res.*` keys went; perf at 4x CPU shows no long task and no gap over 43 ms.
- **Batch 2, 2026-11-19.** Two builders (5ffd7e2..60c00ed, then this run). First builder: the new Home (the Practice
  card, the last quizzes, the teachers' documents), the alert announcer on every screen, JS +10K over batch 1 and still
  42K under the motion work's end. Second builder: the middle of the dock is a yellow pill, "Скенирај за влез" (EN "Scan to
  join", `nav.scanJoin`; `nav.scan` is gone), 56 px tall and 181 px wide at 390 and 360, with Home and Profile 84 and 69 px
  wide; it did not need a shorter label at 360. Its idle is one CSS cycle of 4.5 s with no timer: in about 1.2 s a soft
  shine sweeps across (ease-in-out), the QR glyph breathes to 1.1 on `--spring-bouncy`, and a halo ring scales out and
  fades; then 3.3 s of rest. The first cycle waits 600 ms. All of it is transform and opacity, on the pill's children, so
  the press (`scale` on the link: 0.92 down on `--spring-press`, back on `--spring-big`) never restarts it. The tiny hop
  was tried and left out: it moved the pill while a press was read. Reduced motion has no idle at all and the press dims.
  The scan screen: the four frame corners snap in from the frame's centre on `--spring-pop` (a fade with reduced motion);
  "Внеси код" opens a labelled field (placeholder MATH-7B) under the camera, reachable in every no-camera state; a
  well-formed code goes through `handle`, the same path as a scan (buzz, then `/app/play/<code>`), a code nobody issued
  shows the `Miss` sheet, and an empty or malformed one shows a calm inline message tied to the field with
  `aria-describedby` and `buzz(HAPTICS.problem)`; the camera area is a labelled region and axe is clean in both states.
  Backend handoff 2.15 in the brain (both documents): the proposed `GET /me/documents` and `POST /me/documents/{id}/opened`
  (OPEN-18, demo only), the four endpoints the student app no longer calls, attendance on join unchanged, typing the code
  back (OPEN-03). Tests: tabs, motion (press target and the forward slide), seg (the piece is one stretched piece past two
  tabs, since the pill widened the gap) and alerts (waits only for animations that finish, as the pill never stops) follow
  the pill; new `scan.spec.ts` for the code field; the capture tool has states 67 and 68. Checks: lint, types, 1570 unit,
  `pnpm build`, mock and teacher e2e 772 passed and 4 skipped (the teacher's live-code specs, not mine), live e2e 91 of 91.
  JS (gzip): all screens 440,750 and Home's first load 313,373. Perf at 4x CPU, pill idling: no long task, worst gap 41 ms.
