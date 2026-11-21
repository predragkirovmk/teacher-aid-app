# TeacherAid backend: launch check for coding agents

Written 2026-11-20, for the launch of the real app. For an AI coding agent (Claude Code, Codex, Cursor or similar) working in
the TeacherAid backend repository. A human can read it too, but it is written to be followed step by step.

## 0. What to do with this file

1. **Audit first. Change nothing until the report in section 9 is written and a human has read it.**
2. Work through sections 2 to 8 in order. For every check, find the code that answers it, and give it one verdict:
   - `PASS`: the backend does what the check says. Cite the file and line.
   - `FAIL`: it does something else. Cite the file and line, say what it does, and say the smallest fix.
   - `MISSING`: the endpoint, field or rule is not built at all.
   - `UNSURE`: you could not tell from the code. Say what you would need to run or ask.
3. Do not mark a check `PASS` from a spec, a comment, a type or a test name. Only the code that runs counts. Where you can, run
   the request (section 8) and paste what came back.
4. When you are done, write the report (section 9) into the backend repository as `docs/launch-check-report.md` and stop.

### 0.1 Why this check exists

The frontend changed after most backend work started, and it is now **frozen for launch**: the backend must match the
frontend, not the other way round. The likely gaps:

- The developer handoff copy of the spec is **version 2.3 (2026-10-27)** and the AI spec is **1.0 (2026-11-05)**. Both still
  describe courses, classes, subjects, years, a review summary, a roster before students join, a reveal button, a Review
  phase and the practice set. The teacher app removed all of these on 2026-11-17 and 2026-11-18.
- The student app was simplified on 2026-11-19 (spec 2.15) and students can type the join code again.
- The apps never talk to Supabase directly. They speak one HTTP API with a cookie, and one Server-Sent Events stream.

### 0.2 Sources of truth, in order

1. This file.
2. The frontend code on the `main` branch of the public repository `github.com/predragkirovmk/teacher-aid-app`:
   - teacher app: `lib/teacher/api/types.ts` (every shape the teacher app reads and sends), `lib/teacher/api/live.ts` (every
     call it makes), `lib/teacher/api/shape.ts` (what makes a draft or lesson `invalid_response`), `lib/teacher/api/errors.ts`;
   - student app: `lib/app/api/live.ts` (every call), `lib/app/api/wire.ts` (the wire shapes and stream events),
     `lib/app/api/errors.ts`, `lib/app/session/sse.ts`;
   - `docs/teacher-simple-api-changes.md`: the full list of what the teacher simplification changed, with reasons;
   - `tests/fake-api/server.mts`: a small fake of the student side of the API that the student app's `live` tests run against.
     Where it and your backend disagree on a student endpoint, the fake is what the app was tested with.
3. The backend spec, version 2.15 (2026-11-19) or later. Any older copy loses to 1 and 2.

Where 1, 2 and 3 disagree, report the conflict in section 9. Do not resolve it silently.

## 1. Where things are served

| What | Where |
|---|---|
| The real app (student app at `/app`, teacher app at `/teacher`) | `https://app.teacheraid.education` (a Vercel project of its own) |
| The website and the public demo (never calls the API) | `https://teacheraid.education` |
| The API | `https://api.teacheraid.education`, every path under `/api/v1` |

The app is built with `NEXT_PUBLIC_API_MODE=live`, `NEXT_PUBLIC_API_URL=https://api.teacheraid.education` and
`NEXT_PUBLIC_VAPID_PUBLIC_KEY`. Every request goes to `${NEXT_PUBLIC_API_URL}/api/v1/...`.

## 2. Transport (any FAIL here blocks launch)

- **T1. One HTTP API under `/api/v1`, JSON in and out.** List every route the backend serves (the router, the edge functions,
  the controllers). Compare with the tables in sections 3 and 4. If the plan is for the browser to call Supabase directly
  (supabase-js, PostgREST, RPC, Supabase Realtime, an anon key in the frontend), that is `FAIL`: the frontend has no code for it
  and will not get any before launch. A layer that exposes the paths below is needed (Supabase Edge Functions, a Node service,
  anything), with Supabase behind it.
- **T2. The session is an `HttpOnly` cookie set by the API.** The frontend sends `credentials: "include"` on every request and
  `withCredentials: true` on the stream, and never reads or stores a token. No `Authorization` header is ever sent. If the
  backend expects a Supabase JWT in a header, that is `FAIL`. The cookie: `HttpOnly; Secure; SameSite=Lax`, on
  `api.teacheraid.education` (same site as the app, so it is first-party and Safari keeps it). Signing in elsewhere ends the
  older session: the next request answers `401` with code `signed_in_elsewhere`.
- **T3. CORS.** For the origin `https://app.teacheraid.education` only (not `*`, not `https://teacheraid.education`):
  `Access-Control-Allow-Origin` with that exact origin, `Access-Control-Allow-Credentials: true`, preflight allowed for `GET`,
  `POST`, `PATCH`, `PUT`, `DELETE` with `Content-Type: application/json`, and `Access-Control-Expose-Headers: Retry-After`.
  The stream (T5) needs the same CORS headers.
- **T4. Errors.** Every error is `{ "error": { "code": "<code>", "message": "<text for a log>" } }` with the right status. The
  frontend reads `code`; an unknown code falls back to the status. Codes it knows:
  `unauthenticated` (401), `signed_in_elsewhere` (401), `unknown_email`, `sign_in_failed`, `not_found` (404),
  `validation_failed` (400 or 422), `invalid_state` (409), `session_open` (409), `question_open` (409), `question_closed`,
  `already_answered`, `limit_reached`, `token_expired`, `not_enrolled`, `session_ended`, `generation_failed`,
  `rate_limited` (429, with `Retry-After` in seconds), `server_error` (5xx). A response with no body is answered with `204`.
- **T5. Realtime is Server-Sent Events.** `GET /api/v1/realtime?channels=<a>,<b>` with the cookie, `Content-Type:
  text/event-stream`. Each message is `event: <type>` then `data: <one line of JSON>` then a blank line. `event: ping` every
  20 seconds (the app drops a stream silent for 45 s). Nothing missed is replayed: the app reads a fresh snapshot each time it
  connects. An open stream on a session channel counts as the student being online (presence), and it renews the sign-in. If
  the backend uses Supabase Realtime or another provider, a bridge to this stream is needed (`FAIL` until it exists).
- **T6. Time limits.** Every call answers within 15 s, or the app treats it as being offline. `POST /lessons/generate`,
  `/retry` and `/refine` answer at once with `202` and a `pending` draft; the AI works in the background. A file upload to
  `POST /lessons/sources` may take up to 180 s.
- **T7. Sign-in is a full-page redirect.** `POST /auth/start` (teacher) and `POST /auth/student/start` take
  `{ "provider": "google" | "microsoft", "return_to"?: "<path>" }` and answer `{ "method": "redirect", "url": "<https://...>" }`.
  The URL must be `https:` or the app refuses it. The provider's callback sets the cookie and sends the browser to
  `https://app.teacheraid.education` plus `return_to`, with `?error=<code>` on a refusal. A teacher's `return_to` starts with
  `/teacher`, a student's with `/app`; accept nothing else. No email is sent in the body.

## 3. The teacher app (`/teacher`), as simplified on 2026-11-17 and 2026-11-18

### 3.1 The calls it makes, and nothing else

| Call | Body | Answer |
|---|---|---|
| `POST /auth/start` | `{ provider, return_to? }` | `{ method: "redirect", url }` |
| `POST /auth/logout` | | `204` |
| `GET /me` | | `Me` |
| `PATCH /me` | `{ first_run_done: true }` | anything (the app reads `GET /me` after) |
| `POST /lessons/sources` | JSON `{ text }`, or multipart with the field `file` (PDF, .docx, up to 20 MB) | `{ source_id }` |
| `POST /lessons/generate` | `{ source_id, emphasis? }` | `202` `LessonDraft` (`pending`) |
| `GET /lessons/drafts/{id}` | | `LessonDraft` (polled every 2.5 s while pending: keep it cheap) |
| `GET /lessons/drafts` | | `DraftSummary[]` |
| `PATCH /lessons/drafts/{id}` | `{ title?, questions? }` | `LessonDraft`; `409 invalid_state` unless the draft is `ready` |
| `DELETE /lessons/drafts/{id}` | | `204` |
| `POST /lessons/drafts/{id}/retry` | | `LessonDraft` (`pending`) |
| `POST /lessons/drafts/{id}/refine` | `{ refinement: "easier" \| "harder" \| "more_questions" \| "shorter_timers" }` | a new `LessonDraft` (`pending`, `previous_draft_id` set) |
| `POST /lessons/{id}/drafts` | | `LessonDraft` (`ready`, `lesson_id` set) |
| `POST /lessons` | `{ draft_id, title, questions }` | `Lesson` |
| `POST /lessons/media` | multipart with the field `file` (an image) | `{ id, url, alt }` |
| `GET /lessons` | | `LessonSummary[]` |
| `GET /lessons/{id}` | | `Lesson` |
| `PUT /lessons/{id}` | `{ title, questions, draft_id? }` | `Lesson` (a new version) |
| `DELETE /lessons/{id}` | | `204` |
| `GET /library` | | `LibraryItem[]` |
| `POST /library/{id}/copy` | | `Lesson` |
| `POST /sessions` | `{ lesson_id }` | `ConsoleSnapshot`; `409 session_open` if the teacher has any open session |
| `GET /sessions/open` | | `{ server_now, session: SessionRef \| null }` |
| `GET /sessions/{id}/console` | | `ConsoleSnapshot` |
| `GET /sessions/{id}/class-view` | | `ClassViewSnapshot` |
| `POST /sessions/{id}/advance` | `{ to: "teaching" }` | `ConsoleSnapshot` |
| `POST /sessions/{id}/questions/{sqid}/fire` | | `ConsoleSnapshot`; `409 question_open` while another is open |
| `POST /sessions/{id}/questions/{sqid}/skip` | | `ConsoleSnapshot`; `409 invalid_state` once revealed |
| `POST /sessions/{id}/adhoc` | `{ kind, prompt, options?, correct: string \| null, timer_seconds, numeric? }` | `ConsoleSnapshot` |
| `PATCH /sessions/{id}/anon-questions/{aid}` | `{ answered: boolean }` | anything |
| `POST /sessions/{id}/end` | | `SessionReview` |
| `GET /sessions/{id}/review` | | `SessionReview`; `409 invalid_state` before End |
| `GET /realtime?channels=session.{id}.console` | | the console's stream |
| `GET /realtime?channels=session.{id}.class` | | the projector's stream |

Check each row: the route exists (T1), it takes exactly this body (it must not require anything more), and it answers this
shape. The shapes are in `lib/teacher/api/types.ts`; the ones that changed are in 3.2 to 3.6.

### 3.2 Gone from the teacher app (check that nothing requires them)

- **No courses, classes, subjects, years or rosters.** The app never sends `course_id`, `subject_id`, `year` or
  `review_summary`. `POST /sessions` with only `{ lesson_id }` must work. `POST /lessons/generate` with only
  `{ source_id, emphasis? }` must work. A validator that requires any of those fields is `FAIL`.
- **No review summary.** The AI does not write one, no endpoint stores one, a lesson is valid without one.
- **Endpoints the app no longer calls** (they may exist; nothing may depend on them): `GET /teacher/courses`,
  `GET /courses/{id}/dashboard`, `PATCH /courses/{id}`, `POST` and `DELETE /sessions/{id}/attendance/{student_id}/no-device`,
  `POST /sessions/{id}/questions/{sqid}/reveal`, `POST` and `GET /sessions/{id}/practice-set`.
- **No Review phase.** `SessionState` is `lobby | teaching | ended`. `advance` takes only `{ "to": "teaching" }`;
  `{ "to": "review" }` is `validation_failed`. No `review.ready` event, no `ClassViewSnapshot.review`.
- **Response fields removed**: `subject`, `year` and `review_summary` from every lesson, draft, summary and library item;
  `course_id` from `SessionRef`; `class_name` and `subject_name` from every session answer. Extra fields do no harm, but the
  app does not read them.

### 3.3 Drafts and the AI (the part most likely to be built the old way)

- **D1. `correct` is a string**, always: the option's index as text for multiple choice (`"0"`), `"true"` or `"false"`, the
  number as text with a point for numeric (`"3.5"`). The AI spec 1.0 output schema gives numbers; convert before storing.
  The app refuses a draft or lesson with a number in `correct` as `invalid_response`, and the teacher sees an error instead of
  the questions.
- **D2. Every question has** `id` (string), `order` (number, from 0), `prompt`, `topic` (string), `timer_seconds` (number,
  5 to 300), `explanation` (string or null), `media` (`{ id, url, alt }` or null) and `kind`. Multiple choice adds `options`
  (2 to 4 strings); numeric adds `tolerance` (number), `unit` (string or null) and `allow_negative` (boolean). A ready draft
  has `title` and 5 to 8 `questions`. Run `lib/teacher/api/shape.ts` against a real answer if you can: it names the first
  wrong field.
- **D3. A draft carries** `id`, `status` (`pending | ready | failed`), `failure` (`"generation_failed"` or null), `source_id`,
  `source` (`{ kind: "upload" | "typed", file_name }` or null), `emphasis`, `refinements` (array), `previous_draft_id`,
  `consumed_at`, `lesson_id`, `created_at`, `updated_at`. `title` and `questions` are null unless `ready`.
- **D4. The job rules.** A draft still `pending` after 180 s becomes `failed` on the server. One automatic retry, then
  `failed`. Never a `ready` draft that fails the schema. A second `generate` for a source that has a pending draft answers that
  same draft.
- **D5. Nothing about students goes to the AI**: no names, emails, class lists or answers. Check the code that builds the AI
  request, and if there is a test, that it asserts this on the serialized request.

### 3.4 Live lessons: who is listed

- **L1.** `ConsoleSnapshot.students` lists a student only after they joined (QR or typed code). No roster, no "not here yet"
  rows, no names before the join. `ConsoleStudent` is `{ id, full_name, joined_at, online, answer_state, focus_flags, points }`
  and `joined_at` is always set.
- **L2.** A student may join at any time until End, including during `teaching`. Nothing marks a late join.
- **L3.** `student.joined` on the console channel carries the new `ConsoleStudent`. `joined.count` and the class view's
  `joined_count` are the length of that list; `recent` is the last five names to join, newest first.
- **L4. One open session per teacher**, whatever the lesson: a second `POST /sessions` is `409 session_open`.
- **L5. The speed bonus is always on**: 10 points for a right answer plus up to 5 for speed. There is no switch.

### 3.5 Questions end by themselves

- **Q1.** `QuestionStatus` is `ready | open | revealed | skipped`. There is no `closed` state and no reveal endpoint.
- **Q2.** A question goes from `open` to `revealed` the moment it ends: at `closes_at`, or sooner when every student who is
  there and online has answered. The server decides; a timer job or the answer handler must do it, not a teacher call.
- **Q3.** At the end, in this order: `question.progress` with the final count, `leaderboard.updated`, then
  `question.revealed` with `{ session_question_id, correct_answer, explanation, counts }`. `counts` is
  `{ by_response, right, wrong, unanswered }`. `ConsoleQuestion.revealed_at` is set; `ClassViewSnapshot.reveal` is set.
- **Q4.** `skip` is allowed while `ready` or `open`, and `409 invalid_state` once `revealed`.
- **Q5.** A question still open when End is pressed is not counted anywhere.
- **Q6.** The student app still listens for `question.closed` (section 4.3). Send `question.closed` on the public channel just
  before `question.revealed`. The teacher app ignores it.

### 3.6 The end of a lesson

- **E1.** `POST /sessions/{id}/end` and `GET /sessions/{id}/review` answer `SessionReview`:
  `{ server_now, session: SessionRef, students: [{ student_id, full_name, correct, asked }] }`.
  No `attendance`, `tally`, `most_missed`, `anon_questions` or practice set.
- **E2.** `students` are the students who joined, in register order (surname, then given name, Macedonian alphabet).
- **E3.** `asked` counts the questions sent after the student joined, not skipped, and with a right answer (a quick question
  with `correct: null` is a poll and counts for nobody). `correct` is how many of those the student got right.
- **E4.** A second End is `409 invalid_state`. After End, `GET /sessions/open` answers `session: null`, and
  `state.changed` with `ended` goes out on every channel of the session.

### 3.7 The join code and the QR

- **J1.** `JoinToken` is `{ token, short_code, valid_to }`. Both rotate every 30 s; `join_token.rotated` goes on the class
  channel (and so the console's), **never** on the public channel students read.
- **J2.** `token` uses only `A-Z a-z 0-9 -`. The student app's scanner refuses anything else, so a base64 token with `_`, `+`
  or `/` makes every scan fail.
- **J3.** `short_code` is **exactly six digits** (the teacher's screens show it as `482 913`; students type it).
- **J4.** The QR holds `https://app.teacheraid.education/app/checkin/{token}`.

### 3.8 Channels

| Channel | Who reads it | Events |
|---|---|---|
| `session.{id}.public` | students in the session | `state.changed`, `joined.count`, `question.opened`, `question.progress`, `question.revealed`, `question.skipped`, `leaderboard.updated`, `ping`, and `question.closed` for the student app (Q6) |
| `student.{id}` | one student | `question.result`, `session.ended`, `signed_in_elsewhere`, `notification.created` (4.3) |
| `session.{id}.class` | the session's teacher only (the projector window) | everything on public, plus `join_token.rotated` |
| `session.{id}.console` | the session's teacher only | everything on class, plus `student.joined`, `student.answer_state`, `student.presence`, `anon_question.received`, `focus.flag`, `nudge` |

Each body carries `channel`, `server_now` and the fields in `lib/teacher/api/types.ts`. A student who asks for `.class` or
`.console` is refused. No student channel or student answer ever holds the join token or the short code.

## 4. The student app (`/app`), as simplified on 2026-11-19

### 4.1 The calls it makes

`POST /auth/student/start`, `POST /auth/logout`, `GET /me`, `PATCH /me/profile`, `PUT` and `DELETE /me/profile/photo`,
`PATCH /me/settings`, `POST /me/acknowledgements`, `GET /me/data-summary`, `GET /me/courses`, `GET /me/badges`,
`GET /me/notifications`, `POST /me/notifications/read`, `PUT` and `DELETE /me/push-token`, `GET /me/practice-sets`,
`POST /practice-sets/{id}/answers`, `POST /sessions/join`, `GET /sessions/{id}/student-state`, `POST /sessions/{id}/answers`,
`POST /sessions/{id}/anon-questions`, `POST /sessions/{id}/focus-events`, and the stream
`GET /realtime?channels=session.{id}.public,student.{id}` (plus `channels=student.{id}` alone while the app is open). The
shapes are in `lib/app/api/wire.ts`; `tests/fake-api/server.mts` answers each of them.

No longer called (do not build them for launch; nothing is retired): `GET /me/attendance`, `GET /me/topics`,
`GET /me/leaderboard`, `GET /me/results?course=`. Documents (`GET /me/documents`) are shown only in the demo; not needed.

### 4.2 Joining

- **S1.** `POST /sessions/join` takes `{ "token": "<from the QR>" }` or `{ "short_code": "<six digits a student typed>" }`.
  Both join the same way and answer the same shape. Joining is the check-in (attendance).
- **S2.** Joining twice is fine (idempotent): the second answer is the same.
- **S3.** A token or code that was valid and has rotated away is `token_expired`; one that was never issued is `not_found`.
  A student who reloads the lesson page sends the old code again; on `token_expired` the app reads back the session it
  already joined, so this distinction matters.
- **S4.** Not on the class's list is `not_enrolled`; an ended session is `session_ended`.

### 4.3 Stream events the student app reads

On `session.{id}.public`: `state.changed`, `joined.count`, `question.opened`, `question.progress`, `question.closed`,
`question.revealed`, `question.skipped`, `leaderboard.updated`, `ping`. On `student.{id}`: `question.result` (with
`session_points` and `session_rank`, so the app never adds up), `session.ended`, `signed_in_elsewhere`,
`notification.created`. The bodies are in spec 11.2 and `lib/app/api/wire.ts`.

### 4.4 Practice sets

The teacher app no longer makes practice sets, so in the real app nothing creates one. `GET /me/practice-sets` must answer
`[]` (not an error) when there are none. Report whether the backend makes practice sets in any other way; whether it
should is a decision for the owner.

### 4.5 Push

The VAPID key pair exists, the public half is given to the frontend build as `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (URL-safe base64
of the 65-byte uncompressed point), and the private half stays on the server only.

## 5. Images

`media.url` (a question's picture) is loaded by an `<img>` on `app.teacheraid.education`. Report which host serves it (the
API, Supabase Storage, a CDN): the app's Content Security Policy allows images only from itself and the API origin, so another
host has to be added to the frontend before launch. A picture in a library template is shown to teachers who do not own it, so
its address must not depend on the owner's cookie.

## 6. Privacy facts to report (no code change; the owner needs them for the privacy page)

The privacy page already says: data is stored in the European Union; it is encrypted in transit and at rest; the AI never
receives a student's name, email or the class list; Vercel delivers the app and Supabase stores its data. Report, with
evidence (config files, dashboard settings you can see, environment variable names, never their values):

- **P1.** The Supabase project's region. Is it in the EU?
- **P2.** The AI provider, the model, and where inference runs (for example the Claude API runs `global` or `us`; Claude on
  Google Vertex AI or Amazon Bedrock can run in an EU region). Does any lesson material leave the EU?
- **P3.** Where uploaded files and question pictures are stored, and the region.
- **P4.** Encryption at rest and in transit (TLS on every endpoint, storage encryption).
- **P5.** Every other service that receives personal data (email, logging, error tracking, analytics, push).
- **P6.** How long uploaded source files and AI requests are kept, at the provider and in the backend.

Never copy a key, a secret, a connection string or a person's details into the report.

## 7. Domains and settings

- **H1.** `api.teacheraid.education` resolves to the backend and serves TLS.
- **H2.** The OAuth apps (Google, Microsoft) list one callback: the API's (`/api/v1/auth/callback/{provider}` on
  `api.teacheraid.education`), or, when Supabase Auth runs the handshake, Supabase's own callback, with only the API's
  callbacks in Supabase's redirect allow-list (`docs/backend-integration-guide.md`, section 3).
- **H3.** The allowed origin in CORS (T3) and the redirect target after sign-in (T7) come from configuration, set to
  `https://app.teacheraid.education` in production.

## 8. Run it, where you can

Against a running backend (local or staging), with a signed-in cookie in `$COOKIE`:

```bash
curl -si -X OPTIONS "$API/api/v1/sessions" -H "Origin: https://app.teacheraid.education" -H "Access-Control-Request-Method: POST" -H "Access-Control-Request-Headers: content-type"
```

```bash
curl -s "$API/api/v1/lessons/drafts/$DRAFT" -H "Cookie: $COOKIE" | jq '.questions[0] | {id, order, correct, topic}'
```

```bash
curl -sN "$API/api/v1/realtime?channels=session.$SESSION.console" -H "Cookie: $COOKIE" -H "Origin: https://app.teacheraid.education"
```

The first must show the exact origin, `Access-Control-Allow-Credentials: true` and `Retry-After` in the exposed headers.
The second must show `correct` as a string. The third must print `event: ping` within 20 s.

The full check is the frontend itself: build it with `NEXT_PUBLIC_API_MODE=live` and `NEXT_PUBLIC_API_URL` pointing at the
backend, sign in as a teacher, prepare a lesson from typed text and from a PDF, save it, start it, join from two phones (one
by QR, one by typing the code), send every question, let one run out of time, skip one, end the lesson, and read the end list.

## 9. The report

Write `docs/launch-check-report.md` in the backend repository:

```markdown
# Launch check report

Backend commit: <sha>    Date: <date>    Spec version used: <version>

## Blockers (every FAIL or MISSING in sections 2, 3 and 4)
| Check | Verdict | Where (file:line) | What it does now | Smallest fix |
|---|---|---|---|---|

## Everything else
| Check | Verdict | Where (file:line) | Note |
|---|---|---|---|
(one row for every check id: T1-T7, D1-D5, L1-L5, Q1-Q6, E1-E4, J1-J4, S1-S4, and 3.1 row by row)

## Privacy facts (section 6)
| Item | Answer | Evidence |
|---|---|---|

## Images (section 5)
<host that serves media.url>

## Conflicts between this file, the frontend code and the spec
<list, or "none">

## What I could not check
<list, with what is needed>
```

Then stop. A human decides what to fix first.
