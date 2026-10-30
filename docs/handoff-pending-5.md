# Handoff pending: step 5 (Prepare a lesson, part 1)

For the planner to apply to `backend-spec-for-agents.md` and `backend-guide-for-developer.md` in the brain. Step 5 builds
`/teacher/lessons/new` (F-03: subject and year, the material, the sentence of emphasis, the wait, the failures) and
`/teacher/lessons/drafts/[id]` (the questions of a generation, read only). It adds no endpoint and no field to the shapes of
`handoff-pending-2.md` (A.5 `POST /lessons/sources`, A.6 `POST /lessons/generate`, B.6 `GET /lessons/drafts/{id}`). Everything
below is either a PROPOSAL (marked) or a place where the screens lean on a rule the spec does not state. Nothing here is
decided; the planner decides.

## A. PROPOSAL: a list of drafts, for step 6

"Work saves itself" (the plan) means a teacher who made a draft and left must find it again. Step 5 does not build that: after a
generation the only way to a draft is its address, which the app holds only while the teacher is on it, and a draft the teacher
never saved is, today, lost to them. Step 6 will show unsaved drafts somewhere, most likely on Today next to the prepared lessons.
That needs one read the spec does not have:

- `GET /lessons/drafts?consumed=false` answers the teacher's own drafts that have not been saved as a lesson, newest first:
  `[ { id, title, subject: {id, name}, year, question_count, refinements[], emphasis, source: { kind, file_name } | null,
  created_at } ]`. `consumed=false` is the filter; the default (no parameter) could be the same, since a consumed draft is only
  useful to the person who saved it.
- BR-LES-08 makes each refinement a new draft with a new id and leaves the earlier one readable. A plain list would therefore show a
  chain of drafts of one generation. Either the list answers only the last of each chain (the item then needs `previous_draft_id`
  so the app can tell, and a `GET` of an earlier one stays possible), or the app is told a chain id. The teacher only ever wants
  the latest.
- `DELETE /lessons/drafts/{id}` to throw one away from that list.
- How long an unsaved draft is kept is not in the spec. Proposed: 30 days, then deleted with its source; the mock keeps the last
  20. Say what the teacher is told ("Чуваме до 30 дена").
- `consumed_at` is on the entity (3.1 LessonDraft) and not on the wire shape of 11.5. Step 6 needs it, and a `lesson_id` once saved,
  so that `GET /lessons/drafts/{id}` of a draft already saved can lead to the lesson instead of showing it as if it were still
  unsaved. Whether a saved draft stays readable at all is not in the spec (EC-LES-09 is only about reloading before saving).

## B. What the screens assume of the API

1. The years offered are the teacher's own. The page reads `GET /teacher/courses` once and offers the subjects of those courses
   (each `subject.id` once) and, for the chosen subject, the `class.year` of the teacher's classes in it (each once, the first year
   first, told by its classes: "II година, II-4"). A teacher with one subject sees it stated, not offered; with one year in that
   subject, the same. It sends `subject_id` and `year` to `POST /lessons/generate`. So: a subject the teacher does not teach and a
   year they have no class in are never offered. Whether the API also refuses them is its call (the mock refuses a subject that is
   not one of the teacher's courses and a year outside 1 to 6); the page works either way. A lesson for a year the teacher has no
   class in yet (next year's) is therefore not possible from this page; if the product wants it, the page offers all years.
   The subject has the same `id` here as in `GET /lessons` (`handoff-pending-4.md` B.3).
2. Generation stays one long request, and so does reading a document. `POST /lessons/generate` and a file upload to
   `POST /lessons/sources` are each waited for up to 180 s (BR-LES-09). The page enforces that limit itself too, so the mock and the
   live adapter behave alike: past it the wait becomes "this is taking too long" with a retry. Worst case for a document is
   therefore 180 s of upload plus 180 s of writing; the line "up to 3 minutes" is about each part. A teacher who leaves the
   page, shuts the lid or loses the connection loses the wait: the page abandons the request (`AbortController`), and the app has
   no way to ask what became of it. Whether the server stops writing when the client disconnects, or finishes and keeps a draft
   nobody can reach (it costs tokens, FR-LES-12), is not in the spec. Proposed: stop, when that is cheap; and see C.
3. A retry after a failure asks again with the same `source_id`, so a document is not uploaded twice. That needs a source to outlive
   a failed generation, for at least as long as the teacher may take to press "Обиди се повторно" (minutes), and needs the API to
   say `not_found` for a source it no longer has: the failure is shown in the words of `not_found`, and the retry then makes the source again. The page keeps the id only in memory; a
   source made and never generated from (the teacher left) is an orphan. Its retention is not in the spec; proposed: delete with
   the same rule as a draft, or sooner, a source with no draft after 24 hours.
4. A retry may reach the server while an earlier generation of the same source is still running (the page gave up at 180 s, or the
   connection came back after a drop). Proposed: the API does not mind, and at most one more draft appears; if it is easy,
   one generation per source at a time (a second asks for the first). Not needed by the page.
5. `validation_failed` from `POST /lessons/sources` is read for its `reason` and each of the five (`file_type`, `file_too_large`,
   `empty`, `no_text`, `text_too_short`) has its own words at part 2. With no `reason` it is shown at part 2 in the generic words
   of `err.validation_failed`. The page checks type, size and emptiness of a file, and length of typed text, before it sends, using
   `LESSON_UPLOAD_*` and `TYPED_TEXT_MIN_CHARS` of `lib/teacher/lessons.ts`, so the API's answer is the second look, and the only
   one that can say `no_text`. Two readings the page makes that the spec does not state:
   - `file_type` is judged on the page by the extension (`.pdf` or `.docx`, any case) and nothing else. A file named `.pdf` that is
     a picture, or a renamed `.doc`, reaches the API, which is asked to look at the content and answer `file_type`.
   - Typed text is counted after trimming, in characters (UTF-16 units, which for Macedonian are characters): 39 is `text_too_short`,
     40 is enough. The API should count the same way, or a text the page lets through is refused with a reason the page then says
     at the box, which is acceptable.
6. `validation_failed` and every other failure of `POST /lessons/generate` (not `generation_failed`, which has its own words) is
   shown on the wait view in the words of the code (`err.<code>`), with the retry and Back. `rate_limited` on a generation (a limit
   on AI cost per teacher is likely; the spec has none) is shown with its `Retry-After`.
7. The typed text has no maximum in the spec and the page sets none. The mock keeps 4000 characters. A very long paste is a
   payload and a cost. Proposed: a named constant (for example `TYPED_TEXT_MAX_CHARS` = 20 000) and a `reason: text_too_long`; the
   page would then set `maxLength` and say it. Until then a refusal with no `reason` is shown generically.
8. The sentence of emphasis: the page limits the box to 200 characters, trims it, and sends it only when it is not empty. The server
   cuts an overlong one (BR-LES-07); the page never sends one.
9. `GET /lessons/drafts/{id}` is what makes a reload work (EC-LES-09). The page needs from it exactly the `LessonDraft` of 11.5:
   `title`, `subject`, `year`, `emphasis`, `review_summary`, `questions`. Another teacher's draft is `not_found` (BR-SEC-06), and
   the page shows it as "we could not find this lesson" with a button to prepare one. A draft that has been saved (step 6) is open
   in A above.
10. A session that ends during the wait (a `401 unauthenticated`) ends the wait, and the app signs the teacher out (`handoff-pending-3.md`
    B.2). The sliding expiry proposed there should be renewed by a request that is in flight for minutes; a 180 s request must not
    be the thing that expires the session.
11. The page never uses the open lesson. A teacher with a lesson running may prepare another (EC-SES-01 only stops starting one).
12. EC-LES-05 (student data in an uploaded document) is a sentence under the file button: "Не прикачувајте документи со имиња или други
    податоци на Вашите ученици/студенти." Whether the server also redacts (OPEN-33) changes nothing on the page.

## C. For the planner to weigh: a job the teacher can come back to

Not decided here; the page works as it is. The one long request has costs: a proxy, a CDN or a serverless function may cut a request
well under 180 s; a teacher on a school's connection who closes the lid loses minutes of work and the money it cost; a reload of the wait
starts over; the page cannot show "being prepared" anywhere else. The alternative:

- `POST /lessons/generate` answers at once with the draft in a pending state: `202 { id, status: "pending" }` (the draft's own id, so
  there is no second kind of id).
- `GET /lessons/drafts/{id}` answers the draft with `status`: `pending`, `ready` (the content as now) or `failed` (with the reason, here
  `generation_failed`). The page asks every 2 or 3 seconds while it shows the wait, or listens on the teacher's realtime channel.
- The wait view stays as built (two honest phases, Cancel, the calm line); only what it waits on changes. Cancel becomes
  `DELETE /lessons/drafts/{id}`. Leaving the page then loses nothing: A's list shows the draft as "Се подготвува" and, when ready, opens
  it. A retry is `POST /lessons/drafts/{id}/retry` (or a new generation with the same source), with no new upload.
- Costs: a worker and a state to keep (pending, ready, failed), the cancel, an idempotency rule for a double press, and the polling load.
  It is what A needs anyway for a list that can show drafts being written.

Recommendation for the planner: decide with step 6, when the list of drafts is designed, since the two share the state. The wait view does
not change either way.

## D. Decisions taken (step 5)

- Back on the new page names where the teacher came from. Today's link is now `/teacher/lessons/new?from=today` (as a lesson's card is),
  and Back reads "Назад кон Денес" and returns there; anywhere else it reads "Назад кон Лекции". One assertion in `today.spec.ts` that
  pinned the old address was updated. A sign-in that sends the teacher to the page drops the query (handoff-pending-3 G.4), so then Back
  names Lessons.
- The wait ends with `router.replace` to the draft, so Back from the draft goes to where the teacher started, never to the wait.
- Nothing typed is kept when the teacher leaves the page (it is only in the page's memory); Cancel, Back after a failure and a refused
  source keep everything. The browser's own Back button during the wait cannot be held by a page and is not (the request is abandoned);
  the app's links ask first and closing the tab or reloading is the browser's own question.
- Each of the two calls is given the whole 180 s (BR-LES-09) by the page, and a connection that drops ends the wait at once (the `offline`
  event), without waiting for the limit.
- The demo's AI: `GENERATE_MS` is 8 s and a document is read for 1.5 s (`SOURCE_MS`), so a preview shows both parts of the wait; typed
  sentences are taken at once. Besides `[fail]` (always fails) and a document named like a scan (`no_text`), `[fail-once]` fails the first
  generation of a source and works the second (a retry can be seen to help), and `[slow]` never answers (the 20-second line and the 3-minute
  failure can be seen). A computer that is offline cannot reach the mock either.
- The first-run guide still ends on Today; its hand-off into this page is step 6's (`handoff-pending-3.md` G.1).
