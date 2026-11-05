# Handoff pending: step 8 (Live lesson 1: the console and the class view)

For the planner to apply to `backend-spec-for-agents.md` and `backend-guide-for-developer.md` in the brain. Step 8 builds the console
(`/teacher/live/[sessionId]`), the class view (`/teacher/live/[sessionId]/class`), the realtime layer and a mock that plays a class from the
clock. Everything below is PROPOSED unless it says it is the spec's. Types: `lib/teacher/api/types.ts`; transport: `lib/teacher/api/sse.ts`.

## A. A channel only the class view and the teacher read: `session.{id}.class`

1. 11.2 puts `join_token.rotated` on `session.{id}.public`, calls it "class view only", and students subscribe to that channel. A student at
   home could follow the rotating token and join without being in the room. `review.ready` with the text of anonymous questions is the same
   problem (BR-ANON-06, OPEN-36). PROPOSED: `session.{id}.class`, readable only by the session's teacher (the same cookie, BR-AUTH-08).
2. It carries every public event, plus `join_token.rotated` `{ token, short_code, valid_to }` and `review.ready` `{ most_missed[], anon_questions: [{id, text}] }`.
   `session.{id}.public` loses both. `session.{id}.console` carries public, class and console events (the console shows the code too).
3. The class view subscribes to `.class` alone: `GET /realtime?channels=session.{id}.class`. The console to `.console` alone.
4. Snapshots follow: `GET /sessions/{id}/class-view` (teacher only) carries `join`; nothing a student can read does. Students get the join
   address only by scanning, and the student snapshot (`student-state`) must never hold the token.
5. `ClassViewSnapshot.session` gains `recent: string[]`, the names of the last five to join, newest first (the `recent` of `joined.count`), so a
   reload shows them. `joined.count` also goes on `.class` with `recent`. Whether `recent` may stay on `.public` for the students' lobby is the spec's.
6. `ConsoleSnapshot` gains `join: JoinToken | null` (null after the session ends): the console reads out `short_code`.

## B. The join address and the code

1. The QR holds `{origin of the teacher app}/app/checkin/{token}`, the student app's path (FR-JOIN-02). The origin is `window.location.origin`: the
   student app must be served from the same origin as the teacher app, or the origin must be configured (the page has one place to change).
2. The token is opaque, URL-safe (`[A-Za-z0-9-]`, the student route's pattern). The short code: the app shows what it is given, in groups of three;
   six digits are the easiest to read out and to type. Both rotate every 30 s on the server's clock (BR-JOIN-02); `valid_to` is the end of the window.
   The app carries the server's clock on by its own (`server_now` offset) and reads the snapshot again if a code is over by 4 s and no event replaced it.
3. OPEN-03: the student app removed typing the code on 2026-10-13. The projector therefore says "scan" (QR, or the phone's camera) and does not say
   "enter the code". One constant (`STUDENTS_CAN_TYPE_CODE` in `lib/teacher/live.ts`) flips the sentence if typing comes back. The code is still shown (FR-JOIN-01).

## C. Present without a phone, and taking it back (F-11, FR-ATT-04)

1. `POST /sessions/{id}/attendance/{student_id}/no-device` `{ reason }` (spec): answers the console snapshot. On a student already marked it changes the reason.
2. PROPOSED `DELETE /sessions/{id}/attendance/{student_id}/no-device`: takes the teacher's mark back; the student's attendance is as before it (no row
   until they join, `absent` at End). Answers the console snapshot. Nothing to take back is not an error.
3. **A mark never overrides a join.** `POST ...no-device` for a student who has joined with a phone (attendance `present` or `late`) is `invalid_state` (409).
4. **A join replaces a mark.** A student marked `present_no_device` who then joins with a phone becomes `present` (or `late` after the lobby, BR-JOIN-04),
   `joined_at` is set, `no_device_reason` is cleared, `marked_by` becomes `student`. The mark is gone; if the join is later undone nothing brings it back.
   The console receives `student.joined` with the student as they now are. Join is idempotent as before (BR-JOIN-06).
5. The mark is for lesson states `lobby`, `teaching` and `review`; not after `ended`.

## D. What the console snapshot must carry for the list

Per `ConsoleStudent`, for every student of the class (not only those who joined): `id`, `full_name`, `attendance` (`present`, `late`, `present_no_device`, or
null before anything), `joined_at` (time of the phone's join, null otherwise), `no_device_reason`, `online` (realtime presence; false for a student who
has not joined or has no phone). The list shows, per student: joined, late (attendance `late`), not yet (null), connection lost (joined and `online` false),
or no phone with the reason. "12 of 26 joined" counts `present` and `late`; `present_no_device` is counted apart. Events used: `student.joined` (replaces the
student by id), `student.presence`, `state.changed`, `join_token.rotated`, `joined.count`. A mark or its removal made in another console window arrives only
with the next snapshot (the app reads one after every reconnection); add a `student.updated` event if that must be live.

## E. Moves of the lesson (4.1)

`POST /sessions/{id}/advance` `{ to }` is forward only and one state at a time: `lobby` to `teaching`, `teaching` to `review`; anything else is
`invalid_state` (409), a `to` that is not one of the two is `validation_failed`. The console asks first before leaving the lobby (it cannot go back and
everyone who joins afterwards is late), and says how many have not joined.

## F. Transport (11.4)

`sse.ts` opens `GET /api/v1/realtime?channels=...` with the cookie, listens to each event by name, opens again after an error with a wait of 1 s doubling to 15 s,
drops a stream silent for 45 s (the stream sends `ping` every 20 s), and says "open" at every (re)connection, at which the app reads its snapshot afresh.
A stream that is lost is shown as "Се поврзуваме повторно…". Sign-in renewal by the open stream (handoff 3 B.2) matters most here: a lesson must not lose
its session to an idle timeout while the console is open.

## G. Other assumptions of the screens

1. The class view is a page of the teacher's own sign-in (BR-AUTH-08); a deep link keeps its path and drops its query.
2. The two windows talk over a `BroadcastChannel` in the browser (a heartbeat every 2 s, "closing" on exit); no server is involved.
3. `GET /sessions/{id}/console` and `/class-view` answer `not_found` for a session that is not the teacher's or is not the open one; the screens say "this lesson is not running".
4. The question list on the console during teaching is read from `ConsoleSnapshot.questions` (with the answer; the console only).

## Decisions taken (step 8)

- Starting the lesson asks first ("Да го почнеме часот сега?", safe answer "Не, уште чекам"), as the plan's rule for what cannot be undone. Reversible: drop the dialog.
- The list is in two groups, those not here yet first, register order inside each; a student whose connection is lost comes first among those here.
- The projector window is never called closed before it has been opened; after it was open and goes quiet for 6 s it is.
- English names are transliterated on the class view as everywhere.

## What the demo plays

`lib/teacher/api/mock-live.ts`: from the lesson's id and the clock alone, 70 to 85 percent of the class joins within about a minute at an uneven pace,
1 or 2 join a few seconds after "Почни го часот", one student loses the connection for 15 to 25 s, the rest never join. Not a source for the backend.
