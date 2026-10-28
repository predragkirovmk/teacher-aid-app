# Handoff pending: step 2 (teacher API contract and mock)

For the planner to apply to `backend-spec-for-agents.md` and `backend-guide-for-developer.md` in the brain.
The teacher app now has a typed contract in `lib/teacher/api/types.ts` (wire shapes: snake_case, ISO 8601 UTC) and
an interface in `lib/teacher/api/client.ts`. Everything below is PROPOSED: the spec lists the path and no shape, or no
path at all. The mock (`mock.ts`) answers in these shapes; the live adapter (`live.ts`) calls these paths.

Spec 11.1 and 11.3 say "agree pagination before any list can outgrow one page". None of the lists below are paged.

## A. Shapes proposed for endpoints 11.1 already lists

1. `GET /me` for a teacher (F-01, FR-AUTH-01, FR-SUP-03). `{ id, name, email, role, auth_provider, first_run_done,
   school: { id, name, type } }`. `school.type` is one of `gymnasium`, `vocational`, `arts`, `faculty` (3.1 School.type);
   `faculty` makes the app say "студенти" and "група" (BR-UNI-01). `name` is one script; the English UI transliterates
   (EC-NAME-01).
2. `GET /teacher/courses` (OPEN-02, FR-DASH-01). `[ { id, subject: {id, name}, class: {id, name, year},
   student_count, speed_bonus_on, lessons_run, last_session_at } ]`. `class.year` is 1 to 4 at a school, the study year at
   a faculty.
3. `PATCH /courses/{id}` (BR-PTS-04, US-T17). Body `{ speed_bonus_on }`, answers the course item of 2.
4. `GET /courses/{id}/dashboard` (FR-DASH-01 to FR-DASH-04, BR-TOP-01). One call per course, the whole season:
   `{ server_now, course, students[], sessions[], attendance[], topics[], focus_flags[], anon_questions[], practice[] }`.
   - `students`: `{ id, full_name, joined_mid_year, joined_class_at, points }` (FR-DASH-04).
   - `sessions` (newest first, each reusable through `lesson.id`): `{ id, lesson: {id, title, version}, started_at,
     ended_at, question_count, tally, participation, right_rate, points }`. `question_count` excludes skipped questions.
     `participation` is answers given over answers possible, 0 to 1 (OPEN-19 is still open: this is not the report's formula).
   - `attendance`: one `{ session_id, student_id, status, no_device_reason }` per student per lesson they were enrolled for
     (FR-DASH-03). A student who joined later has no rows before that day.
   - `topics`: `{ topic, right, total, by_student[] }`; an unanswered question counts as wrong, a skipped one does not
     count (BR-TOP-01).
   - `focus_flags`: `{ session_id, session_question_id, student_id, lost_at, back_at, away_seconds }`. FR-DASH-01 says
     "focus flags with reasons", but a `FocusEvent` has no reason (BR-FOC-07); the reason a student scored zero is the
     no-device reason in `attendance`. Confirm that this is what "reasons" means.
   - `anon_questions`: the console shape with the sender, plus `session_id` (FR-ANON-04: senders on the teacher's screens only).
   - `practice`: `{ practice_set, students, completed, average_score }` per session that had a set.
5. `POST /lessons/sources` (F-03, FR-LES-01, FR-LES-06, BR-LES-05). Multipart with `file`, or JSON `{ text }`; answers
   `{ source_id }`. A refused one is `validation_failed` (422) and the envelope carries `reason`: `file_type`,
   `file_too_large`, `empty`, `no_text` (a scan, EC-LES-06) or `text_too_short` (`TYPED_TEXT_MIN_CHARS` = 40, PROPOSED).
   The upload limit is the spec's 20 MB.
6. `POST /lessons/generate` (F-03, FR-LES-03 to FR-LES-05, BR-LES-04). Body `{ source_id, subject_id, year, emphasis? }`
   (`emphasis` cut at 200 characters, PROPOSED). Answers a `LessonDraft`: `{ id, source_id, subject, year, emphasis,
   refinements[], created_at, title, review_summary, questions[] }`. It is slow, so the client waits up to 180 s here and 15 s
   elsewhere (11.4 says 15 s for everything). The review summary is one text.
7. `POST /lessons/drafts/{id}/refine` (F-04, FR-LES-08). Body `{ refinement }`; answers a new draft with a new id and the
   refinement appended to `refinements`. The earlier draft stays readable.
8. `POST /lessons` (FR-LES-07, FR-LES-09). Body `{ draft_id, title, review_summary, questions[] }`, the draft as the
   teacher edited it; 5 to 8 questions (BR-Q-02), else `validation_failed`. Answers the lesson at version 1 and consumes the
   draft. A question is `{ id, order, kind, prompt, media, explanation, timer_seconds (5 to 300), topic }` plus, by kind:
   `multiple_choice` `options[]` (2 to 4) and `correct` (index as a string); `true_false` `correct`; `numeric` `correct`,
   `tolerance`, `unit`, `allow_negative` (3.2, BR-ANS-03, FR-ANS-07).
9. `GET /lessons`, `GET /lessons/{id}`, `PUT /lessons/{id}` (FR-LES-09, BR-LES-03). The list item is `{ id, title, subject,
   year, question_count, version, times_run, last_run_at, copied_from: {lesson_id, owner_name} | null, created_at,
   updated_at }`. The detail adds `review_summary`, `questions`, `source: {id, kind, file_name} | null` and `emphasis`.
   `PUT` takes `{ title, review_summary, questions[] }` and answers the lesson at the next version. "Prepared and not run"
   (Today) is `times_run == 0`, filtered by the client. A school-library lesson may be read with `GET /lessons/{id}` to
   preview it before copying (FR-LIB-01).
10. `GET /library`, `POST /library/{lesson_id}/copy` (F-05, FR-LIB-01 to FR-LIB-03). The item is `{ lesson_id, title,
    subject, year, question_count, owner: {id, name}, saved_at, already_copied }`, colleagues' lessons only. The copy
    answers the new lesson (`copied_from` set); the original is untouched.
11. Live lesson (F-06, F-10 to F-12, FR-SES-*, FR-CON-*, FR-POP-*, FR-END-*, FR-REV-*). Typed in `types.ts`, not yet
    built in the app:
    - `POST /sessions` `{ lesson_id, course_id }` answers the console snapshot. `session_open` (409) when the course has
      one open (EC-SES-02).
    - `GET /sessions/open` answers `{ server_now, session: { ...session, class_name, subject_name } | null }` (FR-END-04).
    - `GET /sessions/{id}/console`: `{ server_now, session, questions[], students[], anon_questions[], focus_flags[],
      board[], nudge }`. A console question is `{ id (the session question), question (with the answer), status, adhoc,
      fired_at, closes_at, closed_at, revealed_at, skipped_at, answered, joined }`. A console student is `{ id, full_name,
      attendance | null, joined_at, no_device_reason, online, answer_state | null, focus_flags, points }`.
    - `GET /sessions/{id}/class-view`: `{ server_now, session: {id, state, lesson_title, class_name, subject_name,
      joined_count}, join: {token, short_code, valid_to} | null, question, progress, reveal, skipped, board, review }`. No
      private data (BR-PRIV-01); the review has the most-missed questions and the anonymous questions as text only.
    - `advance` `{ to }`, `fire`, `reveal`, `skip`, `adhoc`, `no-device` all answer the fresh console snapshot, so the console
      never waits for the event. `invalid_state` (409) for a move 4.1 does not allow; `question_open` (409) for a second
      open question (4.2).
    - `adhoc` body `{ kind: true_false | multiple_choice, prompt, options?, correct: string | null, timer_seconds }`.
      OPEN-14 stays open: `correct: null` is a poll and scores nothing.
    - `POST /sessions/{id}/end` answers `{ server_now, session, attendance[], tally, most_missed[] }`; an attendance row is
      `{ student_id, full_name, status, joined_at, no_device_reason, marked_by }`, in no order the spec fixes (OPEN-06). A most-missed
      question is `{ session_question_id, order, prompt, kind, topic, missed, joined }`, worst first.
    - `GET /sessions/{id}/review` answers `{ server_now, session, most_missed[], anon_questions[], attendance | null }`.
    - `POST /sessions/{id}/practice-set` answers `{ practice_set: { id, session_id, course_id, created_at, question_count } | null }`;
      `null` when nothing was missed (EC-PRA-07, BR-PRA-01).
12. Realtime (11.2, 11.4). Event name is the SSE `event:` line; the body has `channel`, `server_now` and:
    - public: as 11.2. Proposed fields: `join_token.rotated` `{ token, short_code, valid_to }`; `question.revealed` also
      carries `counts: { by_response: { "<response>": n }, right, wrong, unanswered }` (a number question has only right,
      wrong and unanswered); `review.ready` `{ most_missed[], anon_questions: [{id, text}] }`.
    - console only: `student.joined` `{ student }`, `student.answer_state` `{ session_question_id, student_id, state }`,
      `student.presence` `{ student_id, online }`, `anon_question.received` `{ question }` (with the sender), `focus.flag`
      `{ flag: { student_id, session_question_id, lost_at, back_at | null } }` (sent again with `back_at` when the student
      returns, FR-FOC-06), `nudge` `{ idle_seconds }` (interval is OPEN-16).
13. Errors (11). New codes: `generation_failed` (502 or 503, EC-LES-02, after the one retry), `session_open` (409),
    `invalid_state` (409), `question_open` (409). `validation_failed` may carry `reason` (item 5). A teacher whose email is
    not invited is refused as `unknown_email` (F-01 step 2). Another teacher's lesson, course or session is `not_found`.
14. Transport. `NEXT_PUBLIC_API_BASE` + `/api/v1`, `credentials: "include"` (11.4). Before live mode is switched on,
    `next.config.ts` must add the API origin to `connect-src` and `img-src` (question images); today both are `'self'`.

## B. Gaps: the spec lists no endpoint

1. Images on questions (FR-LES-10, FR-LES-11, OPEN-13). Proposed `POST /lessons/media`, multipart `file`, answers `{ id, url, alt }`
   (compressed variants server-side). Images in options and in the reveal are not modelled; formulas (OPEN-13) neither.
2. Marking an anonymous question answered (3.1 `AnonQuestion.answered_at`, FR-REV-02). Proposed `PATCH
   /sessions/{id}/anon-questions/{anon_id}` answering the question with `answered_at` set.
3. Setting `first_run_done` (FR-SUP-03, F-01 step 3). Proposed `PATCH /me` with `{ first_run_done: true }`.
4. Deleting a lesson. Proposed `DELETE /lessons/{id}`; copies and finished lessons survive (EC-LES-04), and the lesson
   stays readable from the course history.
5. The practice completion view (F-12 step 4, FR-PRA-04). Proposed `GET /sessions/{id}/practice-set` answering `{ practice_set,
   students: [ { student_id, full_name, score | null, completed_at | null } ] }`. The dashboard has only the counts.
6. Reading a draft by id (F-03, F-04). Proposed `GET /lessons/drafts/{id}`, so a reloaded review screen finds its draft ("work
   saves itself").
7. The teacher's interface language. It is kept on the device. To follow the teacher between computers, add `locale` to
   `GET /me` and a `PATCH /me/settings` as for students (BR-LANG-01). Optional.
8. Teacher sign-in (`POST /auth/start`, the callback, `POST /auth/logout`) is listed in 11.1 and not typed yet; step 3 does it.
