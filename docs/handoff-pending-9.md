# Handoff pending: step 9 (Live lesson 2: questions, reveal, skip, quick question, inbox, flags, nudge)

For the planner to apply to `backend-spec-for-agents.md` and `backend-guide-for-developer.md` in the brain. Step 9 builds the panel "Прашањето сега", the list of
questions, the quick question, the inbox, the roster's answer states and focus flags, the nudge, and the projector's question, reveal and ranking. Everything is PROPOSED
unless it says it is the spec's. Types: `lib/teacher/api/types.ts`; rules: `lib/teacher/questions.ts`, `lib/teacher/live.ts`.

## A. `media` on `question.opened` and the snapshots

1. `PublicQuestion.media: { id, url, alt } | null` is read by the projector from `question.opened` and from the class-view snapshot (`question`). 11.5 already puts it in both
   snapshots; PROPOSED: `question.opened` carries it too, and the student snapshot's question (`question` of `student-state`), since students need the picture. `alt` is the picture's
   name for a screen reader; the projector falls back to "Слика кон прашањето" when it is null.
2. `PublicQuestion.adhoc: boolean` (new): true for a quick question. The projector says "Брзо прашање" and not "Прашање 3 од 8". `total` and `index` count the lesson's own questions; for a quick one `index`
   is its place in the list and `total` the list's length.

## B. What each screen reads of a question

1. The console list, `ConsoleQuestion`, gains `counts: RevealCounts | null`, set once the question has closed (right, wrong, unanswered, and `by_response`), so the panel can say them at the reveal. Skipped: null.
2. Statuses are the spec's (4.2). `closes_at` is the time the question really ended (BR-NET-03): when every joined, online student has answered (BR-TIME-04) it becomes that moment, and `question.closed` is sent. The app never closes a question early on its own.
3. Reveal counts the projector needs, `question.revealed` and `reveal.counts`: for multiple choice `by_response` keyed by option index as a string, for true/false by `"true"`/`"false"`; `right`, `wrong`, `unanswered` for every kind
   (`unanswered` = students joined when it opened minus those who answered). A numeric question has an empty `by_response`. The bars show whole-number shares of the answers given, summing to 100 (largest remainder); the app does that, the API sends counts only.
4. `question.progress` `{ session_question_id, answered, joined }` is sent right after `question.opened` (answered 0), when `answered` changes (once a second at most) and once more at the close. `joined` is the number joined when it opened.
5. The console reads `student.answer_state` `{ session_question_id, student_id, state }` (spec) and sets `ConsoleStudent.answer_state` to null for everyone when a question closes, is revealed or skipped.
6. The class view's `skipped` is true when the question the view shows was skipped after it was sent. A question skipped before it was sent was never seen: `question` and `skipped` are as before it. Skipping is allowed in `ready`, `open`, `closed`; once `revealed` it is `invalid_state`.
7. A quick question made in another console window arrives by `question.opened` with an id the console does not know; the app then reads the console snapshot (the event has no answer).

## C. Leaderboard (BR-PTS-09, BR-LB-01)

`leaderboard.updated` `{ rows }` holds every joined student, real names, best first, rank 1, 2, 2, 4 for a tie (a tie shares a rank and the next is skipped; ties in the name's order, Macedonian collation), sent after each question closes. `board` of both snapshots is the same list.
No row before the first question has closed (an empty list). A skipped question scores nothing and is out of the ranking. The projector shows the rows with `rank <= 5` and points above 0, at most 7 (a tie at the fifth place is shown whole; `BOARD_SHOWN`, `BOARD_MOST` in `questions.ts`). It follows the reveal on the same screen, beside the bars; between questions the last ranking is shown alone.
Points per scoring.ts: 10 + round(5 x remaining / duration), 0 for wrong or none; the bonus switch is per course.

## D. The inbox of anonymous questions (FR-ANON-10)

1. `ConsoleSnapshot.anon_questions[]`: `{ id, text, sender: { id, name }, created_at, answered_at | null }`, console only. `anon_question.received` `{ question }` on the console channel.
2. `PATCH /sessions/{id}/anon-questions/{anon_id}` takes `{ answered: boolean }` (spec: `true`). PROPOSED: `false` takes the mark back (undo), `answered_at` null. Answers the question. The console reads its snapshot again after it; another console window sees the change only with its next snapshot. Add an `anon_question.updated` event if it must be live.
3. The inbox's order is the app's: not answered first, newest first, then answered, newest first. The API's order is free.
4. The text is on no student channel and no student endpoint (BR-ANON-06), and not in the class view's snapshot or channel in step 9. The review's text (`review.ready`) is step 10's.

## E. The nudge (FR-POP-06, OPEN-16)

1. `ConsoleSnapshot.nudge` is `{ idle_seconds } | null`, not a boolean, so the console can say how long. `nudge` event `{ idle_seconds }`; any `question.opened` clears it.
2. Named constant `NUDGE_AFTER_SECONDS` = 480 (8 minutes; PROPOSED, in `questions.ts`). Due only in `teaching`, with no question open or closed-but-not-revealed, a prepared question still to send, and `idle_seconds` = now minus the latest of: teaching began, a question sent, revealed or skipped. Sent once when it becomes due; the snapshot carries it until the next question is sent.
3. The demo plays it after `DEMO_NUDGE_AFTER_MS` = 90 s (mock option `nudgeAfterMs`).

## F. The quick question (FR-POP-04, FR-POP-07, OPEN-14)

`POST /sessions/{id}/adhoc` body as used: `{ kind: "true_false" | "multiple_choice" | "numeric", prompt, options?, correct, timer_seconds, numeric? }`.
- `kind` adds `numeric` to the spec's two; `numeric` is `{ unit: string | null, tolerance: 0, allow_negative: boolean }` (a minus answer allows a minus).
- `correct` is always a string in the encoding of 3.2; the screen always sends one, so no poll (`correct: null`) is used yet.
- `prompt` trimmed, white space collapsed, at most 200 characters (`ADHOC_PROMPT_MAX`); 2 to 4 `options`, each at most 60 characters; `timer_seconds` a whole number 5 to 300 (BR-TIME-05); the screen starts at the default of the kind (15, 25, 45). Anything else is `validation_failed`.
- Allowed in `teaching` only (`invalid_state` otherwise) and while no question is open (`question_open`, 409). It answers the console snapshot with the new question last in `questions[]`, `adhoc: true`, already `open`. It plays like a prepared one: points, the ranking, the reveal and skip. It is not part of the lesson's saved questions and not in "question 3 of 8".
- `question_open` is also the answer to `fire` while another is open (spec 4.2). The app itself only offers to send when nothing is open and the last sent has had its answer shown or was skipped; the API does not need to enforce the second.

## G. Focus flags (FR-FOC)

`ConsoleSnapshot.focus_flags[]` and `focus.flag` `{ flag }` as the spec (a flag is sent again with `back_at` when the student returns). `ConsoleStudent.focus_flags` is the number of that student's flags in the session; the roster says "Излезе од апликацијата N пати", quietly, never in red. Flags of a skipped question are not shown.

## H. Other things the screens assume

1. The countdown is `closes_at` minus the server's time, carried on by the computer's own clock from the snapshot's `server_now` (the same offset as the join code). Under Reduce Motion the projector's shrinking bar is not shown; the seconds and the count remain.
2. Class-view events used: `question.opened` (public question), `question.progress`, `question.closed`, `question.revealed`, `question.skipped`, `leaderboard.updated`. An event stamped before the held snapshot is dropped and a status only moves forward, so repeats and disorder are safe. A reload reads `GET .../class-view`, whose `question`/`progress`/`reveal`/`skipped`/`board` must describe the same moment.
3. The panel and the projector both pick "the question now" the same way: the one open, else the one last sent or skipped. A question closed and not revealed stays the one until it is revealed or skipped.
4. The 4th no-device reason's words changed (neutral): "Заклучувањето на екранот не е дозволено". No API change.

## Decisions taken (step 9)

- The leaderboard shares the reveal's screen (beside the bars) and is not a separate moment after it: a teacher talks over the reveal for as long as needed. Reversible.
- Moving on to the review is not reachable from the console yet (step 10); the panel after the last question says "Сите прашања се готови".
- Skip asks first with the safe answer as the default; it is offered on the question in the panel and, for a question not sent, on the list.
- The demo's class answers with varied speed (about 55 to 90 percent right, a few never answer, one loses the connection in most questions, 0 to 2 students leave the app); two or three anonymous questions arrive per lesson. Not a source for the backend.
