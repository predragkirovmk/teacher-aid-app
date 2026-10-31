# Handoff pending: step 6 (Prepare a lesson, part 2: the editor)

For the planner to apply to `backend-spec-for-agents.md` and `backend-guide-for-developer.md` in the brain. Step 6 builds generation as
a job (spec 2.7: `202` with a `pending` draft, polled by `GET /lessons/drafts/{id}`), the list of unsaved drafts, the editor of a
draft with autosave, the four refinements as jobs with an undo, saving, editing a saved lesson, and the first lesson of a first run.
Everything below is PROPOSED unless it says it is the spec's. The shapes are typed in `lib/teacher/api/types.ts`, called in
`client.ts` and `live.ts`, and played by `mock.ts` and `mock-drafts.ts`.

## A. PROPOSED: `PATCH /lessons/drafts/{id}`, the teacher's edits saved as they are made

The editor never keeps a change only in the page: each change goes into the draft a moment after the teacher stops typing (0.8 s,
`SAVE_DELAY_MS`), and again by itself every 5 s while a save fails. So a reload, another tab, "Продолжи" on Today and a teacher who
shuts the lid all find the draft as it was left.

1. Body: any of `{ title?, review_summary?, questions? }`, each field replacing the draft's. `questions` is the whole list, in
   order (`order` from 0). The app sends only the fields that changed since its last successful save, but a server may as well
   take all three. Nothing else is accepted (`validation_failed` for an unknown key).
2. Answers `200` with the whole `LessonDraft` (the app puts it in its cache and ignores the content, since it holds the newer
   text itself) and sets `updated_at` (see C.2).
3. Only a draft that is `ready` and not saved: `pending` or `failed` is `invalid_state` (409), a saved one (`consumed_at` set) is
   `invalid_state`, another teacher's or a deleted one is `not_found`.
4. **It checks the shape and no more.** A draft is a lesson in the making, so it holds what a half-edited lesson holds: an empty
   `prompt` or `title`, a blank option, a multiple-choice `correct` of `""` (none chosen), a true/false `correct` of `""`, a numeric
   `correct` that is not a number yet (`""`, `"3,"`), a `timer_seconds` out of 5 to 300 (still a whole number), fewer than 5
   questions. The rules of a finished lesson (BR-Q-02, BR-Q-04, BR-TIME-05, BR-ANS-04, 2 to 4 options with exactly one right) are
   checked when the draft is saved as a lesson (D), exactly as the spec says, and nowhere else. What the shape check does refuse:
   a question that is not an object of one of the three kinds with the right types, more than 8 questions, a repeated question
   `id`, more than 4 options, a `title` or `review_summary` that is not text.
5. A question the teacher adds gets an `id` made by the app (unique in the draft). The API may keep it for the draft; the saved
   lesson's questions get the API's own ids as before.
6. A question's `media` is passed through untouched (images are step 7).
7. `PATCH` is called on the page being left, with `keepalive: true` (the browser may finish a small request after the page is gone),
   so a draft may receive a `PATCH` a moment after the teacher has navigated away. It is idempotent: the same body twice is the same
   draft.
8. Every authenticated request renews the sign-in (BR-AUTH-07), `PATCH` included.
9. Not rate limited in any way the app would notice: a teacher typing continuously sends at most one `PATCH` per 0.8 s, one in
   flight at a time, newest value only.

## B. PROPOSED: `POST /lessons/{id}/drafts`, a draft of a saved lesson, to edit it

1. No body. Answers `200` (the unsaved draft that already exists) or `201` (a new one) with the `LessonDraft`, which is `ready` at
   once (no job): `status: "ready"`, `title`, `review_summary` and `questions` of the lesson's current version, `lesson_id` = the
   lesson, `consumed_at` null, `previous_draft_id` null, `refinements` `[]`, `subject`, `year` and `emphasis` of the lesson,
   `source_id` and `source` of the lesson's source (both null for a copy from the library).
2. **At most one unsaved edit draft per lesson**: if the teacher already has an unsaved draft with this `lesson_id` (the latest of
   its chain, so a refined one counts), that draft is the answer. The app relies on this: "Уреди лекција" on the lesson page and
   "Продолжи" on Today then lead to the same edits, and edits are never split between two drafts.
3. A lesson that is not the teacher's own (including a school-library lesson, which `GET /lessons/{id}` may preview) is `not_found`.
4. The lesson is untouched until the draft is saved. A lesson with an open edit draft is listed and run as before, at its current
   version.
5. The draft lives as any unsaved draft does (BR-LES-12): `DRAFT_RETENTION_DAYS`, then deleted with nothing lost (the lesson is
   there). `GET /lessons/drafts` lists it with `lesson_id` set (G).
6. It can be refined (F) and thrown away (`DELETE`) like any draft; a refinement of it carries the same `lesson_id`.

## C. `LessonDraft` and the list item: what the screens need beyond spec 2.7

1. `source: { kind, file_name } | null` on `GET /lessons/drafts/{id}` as on the list item (spec 11.5 has it on the list item only).
   The wait on the draft page shows "Чекор 2 од 2" for a document and nothing for typed sentences, and after a reload the page has
   only the draft to ask.
2. `updated_at` on the draft and the list item: when the teacher last changed it; equal to `created_at` for a draft nobody has
   edited. The app uses it for one thing: going back to the draft before a refinement ("Врати ги претходните прашања") asks first
   only when `updated_at != created_at` of the refined draft, because the edits since would be lost.
3. `lesson_id` has one more reading than the spec's: **the lesson a draft is about**. It is set from the start on a draft made by
   `POST /lessons/{id}/drafts` (B), and stays when the draft is saved (with `consumed_at`). On a draft of a new lesson it is null
   until it is saved and then the lesson it became (the spec's reading, unchanged). "Unsaved edit draft" is therefore
   `lesson_id != null and consumed_at == null`.
4. `source_id` may be null (an edit draft of a library copy), so a draft that is refined or retried may have no source: BR-LES-10 then
   concerns only the drafts that have one.
5. `questions` of a ready draft may be unfinished (A.4): the type is `DraftQuestion[]`, a `Question` with the gaps of A.4 allowed.
   `POST /lessons` and `PUT /lessons/{id}` still take only finished `Question[]`.
6. A saved draft stays readable and leads to its lesson (spec). The app shows "Оваа лекција е веќе зачувана" with a link to
   `lesson_id` when it is opened.

## D. Saving a draft that carries `lesson_id`

1. A draft with `lesson_id != null` and `consumed_at == null` is saved with **`PUT /lessons/{id}`**, `{ title, review_summary,
   questions[], draft_id }`: `draft_id` is the one new field, optional. The answer is the lesson at the next version, as before.
   With a `draft_id` the API also consumes that draft (`consumed_at`, `lesson_id` unchanged), exactly as `POST /lessons` consumes
   its draft. Without it, `PUT` is as the spec has it (the app always sends it).
2. The `draft_id` must be a draft of the teacher, `ready`, not saved, with `lesson_id` equal to the lesson in the path: otherwise
   `invalid_state` (409) for a draft that is saved or not ready or another lesson's, `not_found` for one that is not there.
3. `POST /lessons` with a draft that carries `lesson_id` is `invalid_state` (409): that draft is an edit of a lesson, not a new one.
   The app never sends it.
4. Both save paths check the finished-lesson rules (BR-Q-04, BR-TIME-05, BR-ANS-04, 2 to 4 options and exactly one right, a
   non-empty title and prompts) and answer `validation_failed` (422) with nothing stored, as the spec says. The app checks them
   first and lists each problem in plain words, so a `validation_failed` here is "something the app and the API read differently".
5. What the app sends on a save: the title and the review summary trimmed; each question with `prompt`, `options` and `topic`
   trimmed, `explanation` null when empty, `unit` null when empty, numeric `correct` written with a point and a leading zero
   ("3,5" is "3.5", ".5" is "0.5", "-,5" is "-0.5"), `tolerance` a number of zero or more, `allow_negative` as chosen, `order`
   from 0 in the list, `timer_seconds` a whole number, `media` as it was. A multiple-choice `correct` is the index as a string and a
   true/false one is `"true"` or `"false"`.
6. The `topic` may be an empty string; the app does not require it (the AI writes one, and a question the teacher adds starts with
   the topic of the one before). The spec does not say it is required, and results by topic would group the empty ones together.
7. The title has no limit in the spec and the app sets none (the page wraps a long one).
8. The first lesson of a first run: after a successful save the app sets `first_run_done` with `PATCH /me` (handoff-pending-3 D.1).
   If that call fails the lesson is still saved, and the app does not send the teacher back to the guide for it in this visit.

## E. How a refinement treats what the teacher has edited since the draft was generated

1. **A refinement refines the draft as the teacher has it, not as the AI wrote it.** The app calls `POST /lessons/drafts/{id}/refine`
   only after the last `PATCH` has been answered (it waits for the pending save, and does not refine if the save failed, saying
   so). The API must therefore make the new draft from the draft's *current* `title`, `review_summary` and `questions` (the
   AI's input for "easier" is the teacher's questions), not from anything kept from the generation. The new draft starts from that
   content and the refinement changes it; `previous_draft_id` is the draft refined.
2. Edits made after the call go to the draft the app is then on, the new one (the app navigates to it at once and shows it
   `pending`, as the wait), so the earlier draft keeps exactly what it had when it was refined.
3. **"Врати ги претходните прашања" is `DELETE /lessons/drafts/{id}` of the new draft**, then the app opens `previous_draft_id`. That
   is why FR-LES-20 and EC-LES-15 matter: the earlier draft is the latest of its chain again, in `GET /lessons/drafts`, with
   its content as it was. A refinement of a refinement undoes one step at a time.
4. A `pending` draft of a refinement is cancelled with `DELETE` too ("Откажи" on the wait asks first), and so is a failed one the
   teacher gives up ("Остави ги како што беа"); each returns the teacher to the earlier draft. A failed refinement is retried with
   `POST /lessons/drafts/{id}/retry`, which re-runs the same refinement of the same earlier draft (spec FR-LES-22); what the
   earlier draft had when the refinement started is what the retry must refine (the app has made no edit to the earlier draft since).
5. A refinement of a lesson draft being edited ("Уреди лекција") works the same and keeps `lesson_id`. "Повеќе прашања" is not offered
   for a draft with 8 questions (the button says so); the API should still answer a request for it with the draft unchanged, or
   `invalid_state`, not 5xx.
6. BR-LES-10 (a second request answers the pending draft) is what makes a double press of a refinement button one job: the app also
   ignores a second press while the first is being sent.

## F. What the screens assume of the spec's job endpoints (all in spec 2.7; listed so they are confirmed)

1. `POST /lessons/generate` answers within the 15 s of 11.4. `GET /lessons/drafts/{id}` is polled every 2.5 s
   (`DRAFT_POLL_MS`) while `pending`, only while the window is visible, and at once when the connection comes back or the window is
   shown again. A `GET` that fails for the network leaves the wait on screen with a calm line ("The work goes on, and you will see it
   when the connection is back"); no other state is assumed.
2. A `pending` draft older than `DRAFT_PENDING_MAX_SECONDS` is `failed` by the API (BR-LES-09): the app has no 180 s timer for the
   AI any more, only for reading a document.
3. The wait may be left at any time: nothing is cancelled by leaving (EC-LES-13). Cancel asks first and is `DELETE`.
4. Cancel of a first generation returns the teacher to the form filled in again. The form's subject, year and emphasis come from the
   draft; the typed text and the document's size come from what the form kept in the tab (`sessionStorage`, for the draft it
   submitted), so a draft opened from Today in another tab, or after the browser was closed, gives the form back without its typed
   text. **Optional, for the API**: `GET /lessons/sources/{id}` answering `{ id, kind, file_name, text }` (`text` for typed
   sentences only, and `not_found` for a source no longer held) would let the form always be filled in again from the server; the app
   does not need it.
5. A document the form kept (a cancelled wait) is used again by its `source_id`; if `POST /lessons/generate` answers `not_found`
   for it (BR-LES-13) the form says the document is no longer held and asks for it again, with everything else kept.
6. `GET /lessons/drafts` (FR-LES-20) is read on Today and asked again every 2.5 s for as long as one of its drafts is `pending`.
   Throwing a draft away from Today is `DELETE /lessons/drafts/{id}` after a question; for a `pending` one the question says the
   preparing will stop.
7. Typed text: the box takes at most `TYPED_TEXT_MAX_CHARS` = 20 000 and says so; `text_too_long` has its own sentence at the box.
8. Preparing a lesson, editing a draft and saving are allowed while a session is open (EC-LES-19); the app does not look at the
   open session on these pages.

## G. `GET /lessons/drafts` list item: two more fields

`lesson_id` (null for a draft of a new lesson, so Today can say "Измени на зачувана лекција" and word the question of throwing it
away differently) and `updated_at` (the date Today says the draft was last changed). Everything else is the spec's.

## H. What the screens assume about timing and failure (no change if these hold)

1. One `PATCH` at a time per draft, in the order the changes were made; the newest text wins. A `PATCH` that fails is tried again every
   5 s and on `online`; the page says "Не се зачува. Ќе се обидеме повторно." and asks before it is left. `401` ends the session as
   everywhere (handoff-pending-3 B.2).
2. A teacher who has the same draft open in two windows is not handled: the last `PATCH` wins, field by field as sent. If the product
   wants it, `PATCH` needs a version (`If-Match`) and the app a merge.
3. Deleting a draft that is being edited in another window makes the next `PATCH` there `not_found`; the page shows it as a failed
   save. Not worth more.
4. The wait, the editor and Today each read the draft by id or in the list; none reads the source.

## I. What the demo plays (`mock.ts`, `mock-drafts.ts`), so the backend can read it

The mock has no worker: a draft's status is worked out whenever it is read, from its job (`started_at`, `done_at`, `outcome`) and the
clock, so a reload finds the job where the clock has put it. Success takes 8 s (`GENERATE_MS`), a refinement 3 s (`REFINE_MS`), a
failure 4 s (`FAIL_MS`). `[fail]` (always fails), `[fail-once]` (the first job of a source fails, a retry or the next generation
works), `[slow]` (never answers: `pending` until the 180 s limit, then `failed`) in the typed text, the emphasis or a document's name
are the demo's way to try the failure screens. A retry starts a new 180 s. Reading a document takes 1.5 s. Every call that needs the
server (`PATCH`, `DELETE`, retry, refine, save, edit) fails as `network` when the computer is offline.

## J. Decisions taken (step 6)

- One model: the teacher always edits a draft; the lesson page's "Уреди лекција" opens a draft of the lesson; "Зачувај лекција" and
  "Зачувај ги промените" are the one yellow button of the editor.
- Edit and "Готово" per question, one open at a time; moving, deleting and the kind of a question are in the open card, so a card that
  is only read has one button. A deleted question is replaced by a line with "Врати го прашањето" (one undo, the last deletion).
- A question is checked when it is finished ("Готово", or opening another) and again when the lesson is saved; the problems of a save
  are listed in plain words, each a link that opens its question and puts the focus at the fault.
- The draft page's Back goes to the lesson for an edit draft, to Today or Lessons as before for a new one, and to the guide for the
  first lesson (`?from=guide`).
- The line after saving is told once (`?saved=new|changes` on the lesson's address, then taken off it). The line after undoing a
  refinement the same (`?undone=1`).
- The guide's last screen, for a teacher whose first run is not done, leads into the form (yellow "Подготви ја првата лекција")
  and has "Не сега, оди на Денес" to leave; `first_run_done` is set by saving that lesson, or by the guide's skip and "Не сега". Until
  then the form and the page of a draft are the only pages besides the guide that a teacher in a first run may open (`isFirstLessonPath`);
  every other page still sends them back to the guide.
- The 30 days an unsaved draft is kept is told under the yellow button (BR-LES-12), from `DRAFT_RETENTION_DAYS`.
