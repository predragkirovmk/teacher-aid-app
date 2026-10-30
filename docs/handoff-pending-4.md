# Handoff pending: step 4 (Today, starting a lesson, the read-only lesson)

For the planner to apply to `backend-spec-for-agents.md` and `backend-guide-for-developer.md` in the brain. Step 4 builds
Today ("Денес"), the window that starts a lesson, `/teacher/lessons/[id]` (read only) and a placeholder for
`/teacher/live/[sessionId]`. It adds no endpoint and no field: everything Today needs is already in the shapes of
`handoff-pending-2.md` (A.9 `GET /lessons`, A.2 `GET /teacher/courses`) and the live lesson of 11.5 (`POST /sessions`,
`GET /sessions/open`). What follows is where the screen leans on a rule the spec does not state, or states two ways.

## A. Where the spec says two things

1. One open lesson per teacher, or per course. EC-SES-02 and FR-SES-10 say `session_open` (409) when the COURSE has an open
   session, so a teacher with II-4 and III-5 could have two open at once. FR-END-04 and FR-END-05 say `GET /sessions/open`
   answers ONE `session` for the teacher, and AC-END-05 shows no way to answer two. The teacher app treats it as one open
   lesson per teacher: Today shows one band, the start window says "Веќе имате час во тек" and offers the way back to it, and
   the mock refuses a second start for any course. Proposed: `POST /sessions` is refused `session_open` (409) when the
   teacher has any session that is not `ended`, whatever the course; EC-SES-02, FR-SES-10 and AC-SES-07 are reworded to say
   so. If two open lessons are wanted, `GET /sessions/open` has to answer a list and Today needs a band for each; say so and
   step 4 changes.
2. What counts as "run". FR-LES-17 says "prepared and not run" is `times_run == 0`, filtered by the client, and 3.1 says
   `times_run` is "how many times it has been run". Not stated: whether a lesson in the lobby or in progress counts. The
   app reads `times_run` as the number of ENDED sessions (the same as `CourseSummary.lessons_run`), so a lesson that is open,
   or that was started and never ended, is still `times_run == 0` and `last_run_at` is the `ended_at` of the latest ended one.
   Today leaves the lesson of the open session out of its list, because the band at the top is about it. Once the session
   ends the lesson has been run and does not come back; the only way a started lesson returns to the list is the demo's own
   "Затвори го демо часот" in Settings. Write the reading into 3.1 and FR-LES-17.

## B. What the screen assumes of the answers (no change if these hold)

3. The same subject has the same `id` in `GET /lessons` (`subject.id`) and in `GET /teacher/courses` (`subject.id`). The start
   window offers the teacher's courses whose `subject.id` equals the lesson's; with different ids for the same subject no
   class would be offered. If the API cannot promise that, say how a lesson's subject and a course's subject are matched.
4. `GET /teacher/courses` needs no subject filter: the client filters, and orders the classes of the lesson's own year first
   (`class.year` equals `lesson.year`; a gymnasium lesson for year 2 lists II-4 before IV-1). A teacher has a few courses, so
   the whole list is cheap. `student_count` is shown beside each class ("26 ученици").
5. `POST /sessions` takes `{ lesson_id, course_id }` and answers the console snapshot (FR-SES-10). The client sends only a
   course whose subject is the lesson's. Whether the API also refuses a lesson whose subject is not the course's is the
   backend's call (the mock does not): the app works either way. A lesson or a course that is not the teacher's is `not_found`
   (BR-SEC-06), checked before `session_open`, as the mock does.
6. `GET /sessions/open` is read on every visit to Today and to a lesson, and again when a start is refused `session_open`,
   because another window may have started the lesson. Its `session` carries `lesson.title`, `class_name`, `subject_name`,
   `started_at` and `state`, and `server_now`; that is all the band and the placeholder need ("Математика, II-4", the
   lesson's title, "Трае 12 минути"). The minutes are `server_now - started_at` carried on by the computer's own clock, so a
   laptop whose clock is wrong still counts right. A lesson nobody ended (EC-SES-01) reads "Започна вчера" or "Започна пред 3
   дена" from the same two fields.
7. `GET /lessons` is answered in no order the spec fixes, and the app does not rely on one: Today sorts by `updated_at`, newest
   first, and shows the first five. The answer must therefore be the whole list (OPEN-37). When it is paged, Today needs
   "prepared lessons, newest change first, five of them, and whether there are more", for example
   `GET /lessons?times_run=0&sort=-updated_at&limit=6`; propose it in the paging decision rather than now.

## C. Not needed

8. Ending a lesson is step 9. Until then the demo closes its open lesson from Settings ("Затвори го демо часот", the mock's own
   control, `demo.closeRunning`), and the placeholder offers no "Заврши го часот". Nothing for the API: `POST /sessions/{id}/end`
   is already in 11.5.
9. The open-lesson indicator on every other page (EC-SES-01, FR-END-04: "End works from anywhere") is not built; Today shows it
   and the other pages do not yet. It needs only `GET /sessions/open`.
10. Optional, for a later step: the 409 of `session_open` could carry the id of the open session, so the window can offer the
    way back without asking `GET /sessions/open` again. The app does not need it.

## Decisions taken (step 4)

- One open lesson per teacher in the mock and the screens (A.1), the planner's call to confirm.
- A started lesson stays in the lobby in the mock; it is `times_run == 0` and is hidden from Today's list while it is open (A.2).
- The lesson view reads `GET /lessons/{id}` and shows what the teacher asked to stress, the questions in order, the right
  answer by an icon and the words "Точен одговор", the timer in seconds and the explanation; the review summary is not shown
  (step 6 edits it).
