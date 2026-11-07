# Handoff pending: step 7 (Lessons and library)

For the planner to apply to `backend-spec-for-agents.md` and `backend-guide-for-developer.md` in the brain. Step 7 builds the Lessons page
(`/teacher/lessons`), deleting a lesson, the picture on a question (editor and every read view), the numeric question's "More options", and the
school library (`/teacher/library`, `/teacher/library/[id]`). It adds no new endpoint: it uses `GET /lessons`, `GET /lessons/drafts`,
`DELETE /lessons/{id}`, `POST /lessons/media`, `GET /library`, `POST /library/{id}/copy` and `GET /sessions/open` as the spec (2.7) lists them.
What follows is what the screens need of them, in the order the owner's brief asked, and every proposal is marked PROPOSED.

## A. The picture on a question (FR-LES-10, FR-LES-11, FR-LES-19, OPEN-38)

1. **Types and size.** JPEG, PNG and WebP, at most `IMAGE_MAX_BYTES` = 10 MB (`10 * 1024 * 1024`; exactly 10 MB is accepted, one byte more is
   not). PROPOSED, and the app holds the same figure in `lib/teacher/images.ts`, so a change is a change on both sides. A phone's photo is 2 to
   5 MB, so 10 MB leaves room for the largest and for a scan of a diagram. One picture per question. No GIF, SVG or HEIC.
2. **The refusal.** `POST /lessons/media` refuses with `validation_failed` (422) and a `reason`, three new ones for 3.2: `image_type`,
   `image_too_large`, `image_unreadable` (an empty file, or one that is not a picture, or is damaged). The app has words for each
   (`err.validation_failed.image_*`) and shows them at the picture. The server judges the type by the **content**, as BR-LES-05 does for a
   document; the app checks only what the computer says the type is (the name's ending when it says none) and the size, before it sends, so the
   API's answer is the second look and the only one that can say `image_unreadable` for a file that is named like a picture.
3. **The answer and the words.** `{ id, url, alt }` as 11.5 has it, with `alt` null: the teacher writes what the picture shows afterwards, in a
   box ("Што има на сликата?", for students who cannot see it well), recommended and **never required**. Those words travel with the question,
   in its `media` (`{ id, url, alt }`), in `PATCH /lessons/drafts/{id}`, `POST /lessons` and `PUT /lessons/{id}`; an empty box is `alt: null`. The
   box (a three-line text area) takes at most `IMAGE_ALT_MAX_CHARS` = 200 characters (PROPOSED, the same as the emphasis); the app turns a line
   break into a space, and the server cuts a longer one. The words are cleared when a picture is replaced by another (they would be about
   something else).
4. **Do not trust `url` from the client.** The app sends back the `url` it was given, but a teacher's browser can send any string, and a
   `url` is what students' phones will load (a tracking address, or a picture that is not the teacher's). PROPOSED: the server reads only
   `media.id` and `media.alt` from a saved question, checks that the id is a picture of that teacher (and school), and fills `url` itself.
   A `media.id` that is not the teacher's is `validation_failed`, or `not_found`.
5. **Replacing and removing.** A replacement is a new upload and a new `media` on the question; removing is `media: null`. Pictures that no
   saved question and no draft holds any more are not deleted at once (an undone edit, a refinement undone, a draft thrown away may bring one
   back): PROPOSED `MEDIA_ORPHAN_HOURS` = 24, deleted with the same retention job as sources (BR-LES-13). The app relies on it: removing a
   picture is one press, and the line that says so has "Врати ја сликата", which sends the same `media` (`{ id, url, alt }`) back in the next
   `PATCH /lessons/drafts/{id}`. So a `media.id` that no question holds any more, and is within `MEDIA_ORPHAN_HOURS`, must be accepted again
   (not `not_found`), and the server fills its `url` as in 4.
6. **Copies and edit drafts carry the picture.** A library copy (`POST /library/{id}/copy`) and a draft of a saved lesson
   (`POST /lessons/{id}/drafts`) hold `media` as the lesson does. Copying must keep the copy's picture whatever happens to the original
   (copy the file, or count references), since deleting a lesson must not break a copy (EC-LES-04).
7. **CSP.** `url` is loaded by an `<img>`, so its origin is in the teacher app's `img-src` (11.4). Done in `next.config.ts`: the teacher app
   (`/teacher/*`) now has its own policy: `img-src 'self'` plus the origin of `NEXT_PUBLIC_API_URL` in a live build, and `connect-src` gets the
   same origin; in mock mode `img-src` is `'self' data:` and nothing else. `blob:` is not in the teacher's policy at all (the app never makes
   one: the browser's `createImageBitmap` reads the file with no address). The student app's policy is as it was. If the pictures are served from
   another origin than the API (a storage or CDN host), that origin is what is wanted in `img-src`; say so and the config follows. Pictures
   behind a sign-in would need `SameSite=None` for the cookie to reach an `<img>`; unguessable addresses avoid the question (the backend decides).
8. **Phone-sized variants** (FR-LES-11) are the server's; the app shows `url` in a box at most 14rem tall on a teacher's screen and does not
   ask for a size. Images in the options and in the reveal (OPEN-38) and formulas (OPEN-13) stay out.
9. **What the demo plays** (so the backend can read it, it is not a source): `uploadMedia` takes 1.2 s, refuses by type and size as above, then
   draws the picture at 1000 px on its longest side as a JPEG (quality 0.8) and answers it as a `data:image/jpeg` address that lives in the
   browser's storage. One of the library's demo lessons ("Планиметрија") has a drawn picture with words, to see a colleague's picture.

## B. The school library (F-05, FR-LIB-01 to -04, BR-LIB-01, -02, AC-LIB-01, -02)

1. **What a list item needs, all in 11.5 already:** `lesson_id`, `title`, `subject { id, name }`, `year`, `question_count`, `owner { id, name }`
   (the colleague's name, shown as "Од Зоран Илиев"; the English interface transliterates it as for the teacher's own name, EC-NAME-01),
   `saved_at` (shown as "Зачувана пред 6 дена") and `already_copied` ("Веќе ја копиравте"). The list is colleagues' lessons only, never the
   teacher's own (BR-LIB-02), and not paged (OPEN-37): the page sorts by `saved_at`, newest first, and filters by subject on the client.
2. **`already_copied`** is read as: the teacher **still has** a copy. A copy the teacher deleted is not one any more, so the lesson can be
   copied again and is not marked. PROPOSED; the spec's "when the teacher has copied it" can be read either way. Copying again is always
   possible and makes a second lesson; the preview says so ("Веќе ја копиравте оваа лекција. Ако ја копирате повторно, ќе добиете уште една
   копија.").
3. **`subject.id`** must be the same value as `subject.id` of a course in `GET /teacher/courses` (as handoff 4 B.3 asks for lessons): a long
   library (more than `LIBRARY_LONG` = 12 lessons, a client constant) opens on "Моите предмети", the lessons whose subject is one of the
   teacher's courses, and "Сите предмети" is one press away. A library of 12 or fewer is shown whole.
4. **The preview** reads `GET /lessons/{id}` of a colleague's lesson (BR-LIB-02), which answers the `Lesson` shape (its `copied_from` null, its
   `source` null). It does not say who made it, so the page also reads `GET /library` and takes `owner` and `already_copied` from the item.
   OPTIONAL, for the backend: put `owner: { id, name }` on the detail of a lesson that is not the teacher's own, and the preview needs no list.
   A lesson that is not in the list (a colleague deleted it, or it is the teacher's own, or the address is old) is shown as "Не ја најдовме
   лекцијата" with a way back to the Library: so a colleague's lesson deleted after the teacher opened the list is `not_found` on the preview
   and on `POST /library/{id}/copy`.
5. **The copy** answers the new `Lesson` (`copied_from { lesson_id, owner_name }` set, version 1, `times_run` 0). The app goes to its page
   (`/teacher/lessons/{new id}`) with a line, said once, that it is copied and is now the teacher's, to be changed with "Уреди лекција". The
   original is never touched (BR-LIB-01). `owner_name` on the copy should be kept on the lesson itself, so that it can be read when the
   original has been deleted.
6. **Only saved lessons** are in the library: a lesson has a version; a draft never is. A lesson the owner has deleted leaves the library at once.
7. **Wording:** the faculty and the school say it in the existing `{ school, uni }` words ("колегите од Вашето училиште" / "од Вашиот
   факултет"). Nothing for the API.

## C. `GET /lessons` and what the Lessons page reads of it

1. **`times_run` and `last_run_at` exactly as 3.1 and FR-LES-17 define them.** `times_run` counts the lesson's sessions that are `ended` and no
   others, `last_run_at` is the latest `ended_at` (null when there is none). The page is made of them: `times_run == 0` is "Подготвени",
   `times_run > 0` is "Одржани", and a held lesson says "Одржана {when of last_run_at} · {times_run} пати" in Macedonian's own forms
   ("пред 3 дена · 2 пати", "1 пат", "21 пат"). A lesson in a session that is in `lobby`, `teaching` or `review` is still `times_run == 0`, so it is
   listed as prepared; its "Започни час" answers that a lesson is running, with the way back to it.
2. **`updated_at`** is when the lesson's current version was made. The prepared lessons are sorted by it, newest change first, since the
   API fixes no order (OPEN-37). The held lessons are sorted by `last_run_at`, the lesson held last first (design review: the card says "Одржана
   пред 3 дена", and a list in the order of another date reads as shuffled; a held lesson's card no longer says when it was last changed).
   The lessons that are not finished are `GET /lessons/drafts`, sorted by the draft's `updated_at`, on the Lessons page and on Today. The
   whole list is needed: the page filters and sorts on the client.
3. **Subject row:** a teacher whose lessons and unfinished lessons together hold more than one `subject.id` gets "Сите предмети" and one choice per
   subject. A subject that has gone from both lists (the last lesson of it was deleted) is not a choice any more and everything is shown.
4. **If paging comes** (OPEN-37), the Lessons page needs: lessons by `times_run == 0` (newest `updated_at` first) and `times_run > 0`
   (newest `last_run_at` first) separately, a page at a time, the subjects the teacher has (to draw the row), and a count of unfinished drafts;
   each section's name carries its count ("Одржани (12)"), so the counts of both lesson lists are needed as well as the pages; Today needs
   three drafts and their number (`GET /lessons/drafts?limit=4`, say). Not decided here.

## D. Deleting a lesson (FR-LES-18, EC-LES-04, EC-LES-10, AC-LES-11)

1. **`DELETE /lessons/{id}`** answers 204 and takes the lesson out of the teacher's lessons and out of the library. Copies colleagues made
   stay, finished sessions stay and are still read from the course history with the title and version they ran (BR-LES-03). After it,
   `GET /lessons/{id}` of it is `not_found`. Another teacher's lesson, or one already deleted, is `not_found` (BR-SEC-06). Without a connection
   the demo answers `network`, as every change does.
2. **A lesson of an open session cannot be deleted.** PROPOSED: `DELETE` is `invalid_state` (409) while the lesson is in a session that is not
   `ended` (which is at most one per teacher, 3.1). The app does not offer the button then: the lesson page asks `GET /sessions/open`
   and says "Прво завршете го часот". `invalid_state` is for a lesson started in another window since the page opened: the question closes and the
   page says the same. Deleting a lesson that has only ended sessions is allowed. Add the sentence to FR-LES-18 and an acceptance criterion.
3. **What happens to an edit draft of a deleted lesson (decision taken, reversible, the planner may change it).** It is **thrown away with the
   lesson**: every draft with `lesson_id` = the deleted lesson goes with it, the unsaved edit drafts (and the refinements in their chain) and
   the saved drafts the lesson was made from, since a saved draft leads to its lesson (BR-LES-08) and the lesson is not there any more. After
   it, `GET /lessons/drafts/{id}` of them is `not_found` and they are not in `GET /lessons/drafts`. The question the teacher answers says so, in a
   sentence added only when such a draft exists ("Промените што сте ги започнале на оваа лекција, а не сте ги зачувале, се бришат со неа."),
   which the app knows from `lesson_id` on the list of drafts. Reading the alternative: keeping the draft would leave a lesson in the making whose
   `PUT /lessons/{id}` can only be `not_found`, and "Продолжи" on Today would lead to a screen that cannot be saved.
4. **Sources.** A source the lesson was made from is kept as long as a draft or a lesson uses it (BR-LES-13); nothing new.
5. **What the app does after:** it goes to `/teacher/lessons` and says once, "Лекцијата е избришана. Одржаните часови и нивните резултати
   остануваат." The line is in the address (`?deleted=1`), told once and taken off; no title travels in an address.

## E. Anything else the screens assume

1. **Numeric question: "Повеќе опции".** Only the screen changed: the answer and the unit stay in view; how far off an answer may be and "may be
   negative" are behind the button, and open on their own when either is set, when a number typed there is not a number, or when the answer is
   below zero with no minus allowed. No change to the shape or the checks (BR-ANS-03, BR-ANS-04).
2. **`GET /lessons/drafts` items** need `subject`, `lesson_id` and `updated_at` as handoff 6 G asks, for the subject row and the edit-draft
   sentence of D.3.
3. **`GET /sessions/open`** is read by the lesson page, as by every page (handoff 4 B.6).
4. **The picture in the other places a question is read:** `PublicQuestion.media` and the console's questions (steps 8 and 9) show it the same
   way, with `alt` as the image's name.
5. **Demo-only:** `Overlay.library_empty` (a school where no colleague has saved a lesson yet) is set only by tests and screenshots; the demo
   school gained a third colleague and two physics lessons, the demo faculty a third colleague and four subjects (so the row of subjects
   shows), none of it a source for the backend.

## F. Decisions taken (step 7)

- **The Lessons page** is one page, no tabs: the yellow "Подготви лекција", the subject row (only for several subjects), then "Подготвени",
  "Недовршени", "Одржани" (the order of Today; changed in the design review, which first had the unfinished ones on top), each only when it
  has something and each with its count; with nothing at all, one card with the yellow button. Every card has one outlined button, the way on,
  and one quiet underlined link beside it: a prepared lesson "Започни час" and "Отвори", a held one "Отвори" and "Започни час" (three lines: the
  subject, year and questions, then, bold, when it was held and how often), a draft "Продолжи" (or "Отвори" while it is being written or has
  failed) and "Фрли". Delete is not on a card. A lesson opened from the Lessons page goes Back to the Lessons (the cards used to say `from=today`).
- **Today** shows three unfinished lessons (`TODAY_DRAFTS_MAX` = 3) in the same order as the Lessons page and, when there are more, "Сите
  недовршени (N)" to `/teacher/lessons#nedovrseni`, where the heading takes the focus.
- **Deleting** is an outlined "Избриши лекција" at the very end of a lesson's page, a question whose answers are "Не, задржи ја" (the yellow
  default) and "Да, избриши ја", the same shape as every other question of the app, and, for a lesson of a running class, the words "Прво
  завршете го часот" in its place. After a delete or a copy the focus is on the line that says so.
- **The picture** sits under the question's words: "Додај слика" is the label of a real file input, with the rules beside it; after a picture
  arrives the focus is on its words; a picture that fails leaves the old one; a failure of the connection or of the server offers "Обиди се
  повторно" with the same file, a refused file does not. In the read views the picture's name for a screen reader is its words (else "Слика кон
  прашањето") and the words are also shown, once, under it for the teacher.
- **The library** has no yellow button on its list (copying is on the preview); an item's one button is "Прегледај". `LIBRARY_LONG` = 12.
- **Tests changed in `editor.spec.ts`:** the tolerance and minus tests press "Повеќе опции" first, the keyboard test has the picture field as a
  stop after the question's words, and the Today test with six drafts expects three and the link.

## G. Added in the design review of step 7 (nothing new for the API beyond A.5 and C.2 above)

- The held lessons' order is by `last_run_at` (C.2). Sections carry counts (C.4).
- The picture's removal can be taken back, which needs a removed `media.id` to be accepted again for `MEDIA_ORPHAN_HOURS` (A.5).
- The words of a picture are a text area of up to 200 characters (A.3).
- The app now says to a screen reader how many lessons a choice of subject shows ("Прикажани се 5 лекции: Математика."); nothing for the API.
