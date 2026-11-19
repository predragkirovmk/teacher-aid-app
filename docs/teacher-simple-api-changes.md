# Teacher app simplification: what changes in the API

For the backend developer. Source: the owner's simplification of 2026-11-17, group 2 (items 5 to 8 of the list in `docs/teacher-plan.md`, "The owner's simplification"). The brain's backend spec is not edited; this file is the record of what the teacher app no longer sends or reads. The types are in `lib/teacher/api/types.ts`, the live adapter in `lib/teacher/api/live.ts`.

In short: the teacher app no longer knows courses, classes, subjects, years or rosters. A lesson is its title, its questions (each with its `topic`), its source and its emphasis. A live lesson lists only the students who have scanned the code. The review summary is gone. The speed bonus is always on.

## Endpoints removed

| Endpoint | Why |
|---|---|
| `GET /teacher/courses` | No courses in the app. |
| `GET /courses/{id}/dashboard` | The course results page is gone (group 1 removed Classes). |
| `PATCH /courses/{id}` | It only set `speed_bonus_on`; the bonus is always on now. |
| `POST /sessions/{id}/attendance/{student_id}/no-device` | No "Без телефон" marking: a student is listed only after they join. |
| `DELETE /sessions/{id}/attendance/{student_id}/no-device` | Same. |

## Types removed

`Subject`, `ClassRef`, `CourseSummary`, `CoursePatch`, `CourseDashboard`, and the types only the dashboard used (`DashboardStudent`, `DashboardSession`, `DashboardAttendance`, `DashboardTopic`, `DashboardFocusFlag`, `DashboardAnonQuestion`, `DashboardPractice`), and `NoDeviceRequest`.

## Request bodies that change

| Endpoint | Before | Now |
|---|---|---|
| `POST /lessons/generate` | `{ source_id, subject_id, year, emphasis? }` | `{ source_id, emphasis? }` |
| `POST /sessions` | `{ lesson_id, course_id }` | `{ lesson_id }` |
| `PATCH /lessons/drafts/{id}` | `{ title?, review_summary?, questions? }` | `{ title?, questions? }` |
| `POST /lessons` (`SaveLessonRequest`) | `{ draft_id, title, review_summary, questions }` | `{ draft_id, title, questions }` |
| `PUT /lessons/{id}` (`UpdateLessonRequest`) | `{ title, review_summary, questions, draft_id? }` | `{ title, questions, draft_id? }` |

A lesson is now valid with a non-empty title and 5 to 8 valid questions. `review_summary` is not required and not read. A body that still carries `subject_id`, `year` or `review_summary` may be refused as `validation_failed` or have the field ignored; the app never sends them.

## Response shapes that change

- **Lesson** (`GET /lessons/{id}`, `POST /lessons`, `PUT /lessons/{id}`, library copy): no `subject`, no `year`, no `review_summary`. Everything else stays (`source`, `emphasis`, `version`, `times_run`, `last_run_at`, `last_session_id`, `copied_from`, `questions`).
- **LessonSummary** (`GET /lessons`): no `subject`, no `year`. `times_run` and `last_run_at` now count every run of the lesson.
- **LibraryItem** (`GET /library`): no `subject`, no `year`.
- **LessonDraft** (`GET /lessons/drafts/{id}` and the other draft endpoints): no `subject`, no `year`. The `ready` variant has no `review_summary`; `pending` and `failed` drafts no longer carry `review_summary: null`.
- **DraftSummary** (`GET /lessons/drafts`): no `subject`, no `year`.
- **SessionRef** (inside most session answers): no `course_id`.
- **OpenSession** (`GET /sessions/open`): `session` is a plain `SessionRef`; `class_name` and `subject_name` are gone.
- **ConsoleSnapshot** (`GET /sessions/{id}/console` and every call that answers the console): `session` is a plain `SessionRef`, without `class_name` and `subject_name`. `students` holds only students who have joined (see below).
- **ClassViewSnapshot** (`GET /sessions/{id}/class-view`): `session` has no `class_name` and no `subject_name`. It keeps `lesson_title`, `joined_count` and `recent`. The projector shows the lesson title where it showed the class.
- **PracticeSetSummary**: no `course_id`.

## The console's student list

`ConsoleStudent` is a student who has joined, and nothing else:

```
{ id, full_name, joined_at: IsoTime, online, answer_state, focus_flags, points }
```

Removed: `attendance`, `no_device_reason`, and the null `joined_at`. `joined_at` is always set.

Rules for the server:

- `ConsoleSnapshot.students` lists a student only once they have joined with the QR code or short code. There is no roster of enrolled students, no "not here yet" entries and no names before the join.
- A student may join at any time until End, including after the lesson moved from `lobby` to `teaching`. Nothing marks a late join.
- The `student.joined` event on the console channel carries the new `ConsoleStudent`. The app appends it to the list. It was an update of a roster row before.
- `joined.count` and `class-view.session.joined_count` are the length of that list. `recent` is the names of the last five to join, newest first.
- `student.presence`, `student.answer_state`, `focus.flag` and `anon_question.received` are unchanged and only ever refer to a student who has joined.
- Questions: `ConsoleQuestion.joined` and `question.progress.joined` are the number of students who had joined when the question opened, as before. Nobody who had not joined is counted as unanswered.

## End of a lesson and attendance

`AttendanceRow`, `AttendanceStatus`, `NoDeviceReason`, `AttendanceTally`, `EndResult.attendance`, `EndResult.tally` and `SessionReview.attendance` keep their shapes (group 3 rebuilds the end page). What the server must write now:

- `POST /sessions/{id}/end` and the review list only the students who joined. Every row has `status: "present"`, `marked_by: "student"`, `no_device_reason: null` and a `joined_at`.
- The server writes no `late`, `absent` or `present_no_device` rows. In `tally` those three counts are 0 and `total` is the number who joined.
- The same holds for lessons ended earlier: `GET /sessions/{id}/review` for an old session returns only the students who were present. Rows that were `late` are returned as `present`; `absent` and `present_no_device` rows are dropped.
- `GET /sessions/{id}/practice-set` lists the students who were in the lesson.

## Rules that change

- **One open session per teacher.** EC-SES-02 said one per course. `POST /sessions` answers `session_open` (409) when the teacher already has an open session, whatever the lesson. `GET /sessions/open` already answered one.
- **The speed bonus is always on** (BR-PTS-04): up to 5 extra points for a right answer by speed. There is no per-course switch, and no field to read or write it.
- **No review summary** (FR-LES-04): the generator does not write one and no endpoint stores one.
- **The school type still matters.** `Me.school.type` (`SchoolKind`) still decides whether the app says "ученици" or "студенти". Nothing else of the school's classes or groups is used.

## Realtime

No event is added or removed. `student.joined` changes meaning as described above, and every snapshot an event may carry has the shapes above.

## Group 3: the answer shows by itself, no Review phase, the end list, no practice set

Source: the owner's simplification of 2026-11-17, group 3 (items 9 to 11 in `docs/teacher-plan.md`, "The owner's simplification"). The types are in `lib/teacher/api/types.ts`; the live adapter is `lib/teacher/api/live.ts`. This section replaces what the "End of a lesson and attendance" section above says about the end list.

### Endpoints removed

| Endpoint | Why |
|---|---|
| `POST /sessions/{id}/questions/{sqid}/reveal` | The right answer shows by itself when the question ends. There is no button. |
| `POST /sessions/{id}/practice-set` | The practice set is removed from the teacher app. |
| `GET /sessions/{id}/practice-set` | Same. |

The `advance` endpoint stays and takes only `{ "to": "teaching" }`. `{ "to": "review" }` is `validation_failed`.

### The question ends and its answer shows

- `QuestionStatus` is `ready | open | revealed | skipped`. `closed` is gone.
- A question goes from `open` to `revealed` the moment it ends: at its time (`closes_at`), or sooner when every student who is there and online has answered (BR-TIME-04). The server decides the end; no teacher call is involved.
- `ConsoleQuestion.closed_at` is removed. `revealed_at` is when the question ended (so it equals `closes_at` once the end is reached early). `counts` is set from then on.
- `ClassViewSnapshot.reveal` is set once the question has ended (it was: once the teacher revealed it). `PublicQuestion.status` is `revealed` then.
- Events: `question.closed` is removed from the public, class and console channels. `question.revealed` (with `correct_answer`, `explanation`, `counts`) is sent at the end. `question.progress` with the final count and `leaderboard.updated` are sent just before it, in that order, so the projector can show the ranking beside the answer.
- Skipping: `POST .../skip` is allowed for a `ready` or `open` question, and is `invalid_state` for a `revealed` one (a question whose answer has shown is part of the lesson).
- A question still open when the teacher presses End is not counted in the end list (see below).

### No Review phase

- `SessionState` is `lobby | teaching | ended`. The lesson goes `lobby` to `teaching` with `advance`, and from either to `ended` with End (`POST /sessions/{id}/end`), as before.
- Removed: `ClassViewSnapshot.review` and the `ClassViewReview` type, the `review.ready` event on the class and console channels, and the `MissedQuestion` type.
- `question_open` is no longer an answer of `advance`.
- Anonymous questions are read from the console only (`ConsoleSnapshot.anon_questions` and `anon_question.received`), in the teacher's tab, for as long as the lesson is open. Nothing about them goes to the class channel any more.

### The end list

`SessionReview` is now:

```
{ server_now, session: SessionRef, students: ResultRow[] }
ResultRow = { student_id, full_name, correct: number, asked: number }
```

- `GET /sessions/{id}/review` answers it once the session has ended, and `invalid_state` (409) before. `POST /sessions/{id}/end` answers the same object. The `EndResult` type is removed.
- `students` are the students who joined, in register order (surname, then given name, Macedonian alphabet). No student who never joined is listed.
- `asked` is the number of questions that were put to the student: sent after the student joined (`student.joined_at <= question.fired_at`), not skipped, and with a right answer. A quick question made on the spot with `correct: null` is a poll and counts for nobody. `correct` is how many of those the student answered rightly (BR-ANS-01..03). A question that had not ended when End was pressed is not counted.
- Removed from the answer: `attendance`, `tally`, `most_missed`, `anon_questions`. Removed types: `AttendanceRow`, `AttendanceStatus`, `AttendanceTally`, `NoDeviceReason`, `MissedQuestion`, `EndResult`.
- Lessons ended earlier are read the same way, from the answers they already hold.

### The practice set is removed

Removed types: `PracticeSetSummary`, `PracticeSetResult`, `PracticeResults`. The teacher app no longer sends missed questions as homework and no longer shows who did it. What the student app does with practice sets is not part of this change.
