# Handoff pending: step 10 (End: the review, End with its question, the attendance list, the practice set)

For the planner to apply to `backend-spec-for-agents.md` and `backend-guide-for-developer.md` in the brain. Step 10 builds the way from teaching to the review, the review on the console and
the projector, End (from the console in every state and from the band and reminder of every page), the end page with the attendance list and the practice set. Everything is PROPOSED
unless it says it is the spec's. Types: `lib/teacher/api/types.ts`; rules: `lib/teacher/review.ts`, `lib/teacher/attendance.ts`, `lib/teacher/scoring.ts`.

## A. `MissedQuestion` needs the answer and the explanation

The review says the right answer on the console and, with the explanation, on the projector (FR-REV-01, F-06 step 9). The spec's `{ session_question_id, order, prompt, kind, topic, missed, joined }`
(11.5) has neither. PROPOSED, four new fields, in `most_missed[]` of `POST /sessions/{id}/end`, `GET /sessions/{id}/review` and `review.ready`:

- `correct_answer`: the right answer in the encoding of 3.2 (the option's index as a string, `"true"` or `"false"`, the number with a point);
- `explanation`: text or null;
- `options`: the choices of a multiple-choice question in their order (so the answer can be said in words), else null;
- `unit`: the unit of a numeric answer, else null.

`review.ready` goes to the class channel and the console channel only, and so these reach no student (BR-ANON-06). The ranking is worst first by the share `missed / joined`, then by `missed`, then by
`order`; only a question with `missed > 0` is in it; a skipped question and one never sent are not. `missed` and `joined` leave out a student who joined after the question was sent, on both sides (BR-PRA-07).

## B. Quick questions (OPEN-14)

The planner's reading, which the app uses: a quick question ("Брзо прашање", `adhoc`) counts like any other question of the session. It is in `most_missed[]`, so on both review screens and on the end page, and it
can be in the practice set under the same rule as the others (BR-PRA-01). Its topic is the lesson's title (BR-TOP-03). A skipped quick question counts nowhere, as no skipped question does. A quick
question that is a poll (`correct: null`, OPEN-14) has no right answer, so it is not missed and not in the review or the set.

## C. Moving to the review, and the console after End

1. `POST /sessions/{id}/advance { to: "review" }` is refused `question_open` (409) while a question is `open`. The app never offers it then; the refusal is for a second window. It is allowed with questions not yet sent: they are never asked.
   A question that has closed and whose answer is not shown yet counts in the review (its `counts` are final).
2. `GET /sessions/{id}/review` before the session reaches `review` is `invalid_state` (409). In `review` it answers `attendance: null`; after End it answers the full list (FR-REV-03). The app reads it for the review on the console, and
   for the end page of an ended session (also a held lesson, days later), so it must answer for any ended session of the teacher.
3. `GET /sessions/{id}/console` of an ended session: the app takes either an answer with `session.state: "ended"` or `not_found` as "this lesson has ended" and then reads the review. Say which it is.
4. `GET /sessions/{id}/class-view` of an ended session answers a snapshot with `session.state: "ended"`, `join: null`, `question: null`, `board: []`, `recent: []`, `review: null`: it must hold nothing a student's name could leak through.
5. `state.changed { state: "ended" }` is sent on `.public`, `.class` and `.console` when End is pressed, so a second console and the projector follow without a read (11.2 lists `state.changed` on the public channel; `session.ended` on `student.{id}` is the spec's and stays).
6. `review.ready` is sent when the session reaches `review`, on `.class` and `.console` only (AC-ANON-09), with `most_missed[]` (A above) and `anon_questions: [ { id, text } ]`, text only. A question the class writes after that arrives on the console only (`anon_question.received`);
   the projector shows the list it was sent, and a snapshot read later has them all.
7. Which screen of the review the projector shows (one most-missed question at a time, then the questions the class wrote, three at a time) is kept by the two windows between themselves in the browser (a `BroadcastChannel`), as the heartbeat is. No endpoint
   or field. If the place should survive a closed console, add it to the class-view snapshot (`review.screen`) and a `PUT` for the console; the app would use it as it uses the rest.

## D. End

1. `POST /sessions/{id}/end` answers `{ server_now, session (state "ended", ended_at set), attendance[], tally, most_missed[] }` (FR-END-06). An attendance row is `{ student_id, full_name, status, joined_at, no_device_reason, marked_by }`; a student
   who never joined and was not marked is `absent`, `marked_by: "system"`; a student marked present without a phone is `present_no_device` with the reason, `marked_by: "teacher"`; a joined student is `present` or `late`, `marked_by: "student"`.
   A question still open when End is pressed: the app never offers End with a lesson's question open without the teacher choosing to (End is available then), so the server decides; the demo leaves that question out of the counts. Say what the server does.
2. A second `POST /sessions/{id}/end` on an ended session is `invalid_state` (409) and changes nothing (EC-SES-09). The app treats it as "ended" and looks again.
3. `GET /sessions/open` answers `session: null` after End.
4. `tally` is `{ present, late, absent, present_no_device, total }`; the app counts the rows itself for the page, so the two always agree.
5. The order of the list (OPEN-06, DECIDED by the app, reversible): the response has no fixed order; the app sorts by surname, then given name, in the Macedonian alphabet (the surname is the last word of `full_name`, which holds the given name first). If the server fixes an order, say it and the app can drop the sort.
6. The format of the copied list (OPEN-06, DECIDED by the app, one function `attendanceLine` in `lib/teacher/attendance.ts`): one student a line, "Презиме Име: присутен/а", with "задоцнет/а", "отсутен/а", and "присутен/а без телефон (причина)" for a student present without a phone, the reason in lower case. No heading. Printing is a print stylesheet of the same list.

## E. Practice set

1. The rule is BR-PRA-01 with the OPEN-08 reading of BR-PRA-07, named constants `PRACTICE_MISS_SHARE` = 0.4, `PRACTICE_MIN` = 2, `PRACTICE_MAX` = 8 (`lib/teacher/scoring.ts`); a late joiner is on neither side of a question's share; a skipped question never; a quick question like any other (B).
2. `POST /sessions/{id}/practice-set` only after End (`invalid_state` before); when a set exists it answers that set, not a second one (one set per session, idempotent); `{ practice_set: null }` when nothing was missed (EC-PRA-07).
   The app does not call it for a session whose `most_missed` is empty; it shows "nothing to send" at once, and shows the same if the call answers null.
3. `GET /sessions/{id}/practice-set` is `not_found` while no set has been sent, and then `{ practice_set, students[] }` with one row for every student enrolled in the course (FR-PRA-10), `score` and `completed_at` null until the student has finished. The page asks again every 30 seconds.
4. The student-facing side of the set (notification `practice_set_sent`, `GET /me/practice-sets`) is the spec's and is not touched.

## F. A held lesson leads to its end page

`LessonSummary.last_session_id: Id | null`: the latest ended session of the lesson (for any course), null if none. The lesson page shows "Погледни го списокот од последниот час" when it is set; it leads to `/teacher/live/{session_id}`,
which is the console while the session runs and the end page once it has ended. `times_run`, `last_run_at` and a course's `lessons_run` and `last_session_at` count ended sessions only (as before).

## G. The demo

The demo has no way to close a lesson but End: the Settings control "Затвори го демо часот" is gone; "Симулирај час во тек" remains, for trying Today with a lesson running. Not API.
