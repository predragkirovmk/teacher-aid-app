# Handoff pending: step 3 (teacher sign-in and first run)

For the planner to apply to `backend-spec-for-agents.md` and `backend-guide-for-developer.md` in the brain. Step 3 types the
teacher's sign-in in `lib/teacher/api/types.ts` and `client.ts`, implements it in `live.ts`, and plays it in `mock.ts`
(`mock-session.ts`). Everything below is PROPOSED: where it differs from the spec's text, the owner's decision of 27 Oct (the
school's Google or Microsoft account, no passwords, no emailed codes, only invited emails) and the brief of this step are the
reason. Read together with `handoff-pending-2.md`, whose B.3 (`PATCH /me`) and B.8 (the auth endpoints) this step settles.

## A. Where the spec's text and the app differ

1. `POST /auth/start` for a teacher takes `{ provider, return_to? }`, not `{ email, return_to? }` (11.1, F-01 step 1,
   FR-AUTH-10). The teacher presses "Најави се со Google" or "Најави се со Microsoft", as a student does; nothing is typed, so no
   email travels and there is no login hint. The answer is `{ method: "redirect", url }`, the provider's own address, and the
   app sends the browser there with a full page load (no popup). Errors: `validation_failed` (422) for any other provider,
   `rate_limited` (429, with `Retry-After` in seconds, exposed to the browser through CORS as 11.4 already asks). FR-AUTH-09's
   "also per email" cannot apply here: limit per address (and per provider).
   The student endpoint `POST /auth/student/start` has the same body; the two can stay apart or become one, the app does not mind.
2. `GET /auth/callback/{provider}` is shared by students and teachers, so it must decide which list the account's email is
   matched against. Proposed: by the prefix of `return_to`: `/teacher` means the invited teachers (and admins), `/app` the
   student rosters. A `return_to` of neither has no screen to be sent back to: the API answers it with its own error page.
3. `return_to` for a teacher is `/teacher/sign-in`, or `/teacher/sign-in?next=%2Fteacher%2Fclasses` when the teacher was heading
   for another page. The API accepts only a path that starts with `/teacher`, with or without a query, and redirects to the
   app's origin plus that path with the query kept as it is. A refusal appends `error=unknown_email` or `error=sign_in_failed`
   (with `&` when there is a query already, else `?`), as 11.3 says for students. The app reads `error` once, removes it from
   its address, and ignores any other value. `rate_limited` on the callback (FR-AUTH-09 limits it per address) cannot carry a
   `Retry-After` on a redirect: answer it as `error=sign_in_failed` (the screen then says "Најавувањето не успеа или е
   откажано. Обидете се повторно.").
4. One sentence covers three refusals, because the API cannot tell them apart and the screen cannot either: an account that
   nobody invited, a personal account instead of the school's (EC-AUTH-09), and the wrong provider for the school
   (FR-AUTH-10). All are `unknown_email`. The copy says: "Оваа адреса не е меѓу поканетите наставници. Најавете се со адресата од
   Вашата установа или побарајте покана од администраторот." If the product wants the wrong-provider case told apart, the
   callback needs a distinct code (for example `wrong_provider`); until then it is not.
5. Two sign-in buttons are shown to every teacher, whatever provider the school uses; the school's provider is not known before
   sign-in, because nothing is typed. So half of the presses of a careless teacher end in `unknown_email`. Cheap remedies, if
   wanted later: the app remembers the provider that last worked on this computer and puts that button first (the API is
   not involved), or the callback sends `error=unknown_email&provider=<the school's>` when the email's domain matches a
   school that uses the other one. Neither is built.

## B. The session

1. The teacher's session is the same kind of cookie as the student's (FR-AUTH-08): `HttpOnly`, `Secure`, set by the callback,
   never read by the app. The app sends `credentials: "include"` on every call and holds no token. 11.4's cross-origin rules
   apply (`SameSite=None; Secure`, or both under one site with `Lax`). Because a teacher's calls change a great deal
   (lessons, sessions, the end of a lesson), a cross-site `SameSite=None` cookie needs a CSRF defence the spec does not mention;
   deploying `app.` and `api.` under one site avoids the question. The backend developer decides.
2. How long it lasts is not in the spec and the app does not know. What the app needs: it treats any `401 unauthenticated`
   from any call, while the teacher was signed in, as the end of the session, and says "Ве одјавивме поради безбедност. Најавете се
   повторно." and returns the teacher to the page afterwards. A session that ends during a live lesson is the worst case, so
   proposed: sliding expiry renewed by every request and by the realtime stream (`TEACHER_SESSION_IDLE_HOURS = 12`), a hard limit
   of `TEACHER_SESSION_MAX_DAYS = 30`, and a session never expires while the teacher has a session that is not `ended`
   (4.1), since an expiry would otherwise end a lesson that only the teacher may end (section 0.4, rule 6).
3. More than one session per teacher is assumed: a teacher may be signed in on the school laptop and on another computer, and the
   console and the projected class view are two windows of one browser that share the cookie. There is no teacher version of
   `signed_in_elsewhere` (BR-AUTH-03 is for students), and the teacher app does not treat that code as the end of a session.
   If the product wants one session per teacher, say so: the app then needs the same full screen the student app has.
4. `POST /auth/logout`: no body; ends the session on the server and its realtime streams; 204. A 401 for a session already ended
   is as good (the app counts it as signed out, EC-AUTH-08). When the server cannot be reached, the app stays signed in and says
   so. After a successful sign-out the app forgets everything it holds; the API forgets nothing about the teacher's lessons.
5. Which 401s the app may see: only for "no valid session". Nothing else may answer 401 to a signed-in teacher, because the app
   will sign them out; a refusal for another reason is 403 or 404 (`not_found` for another teacher's lesson, course or session,
   as `handoff-pending-2.md` item 13 has it).

## C. `GET /me` for a teacher

1. The shape stays as in `handoff-pending-2.md` A.1: `{ id, name, email, role, auth_provider, first_run_done, school: { id,
   name, type } }`. Nothing was added.
2. `401 unauthenticated` with no session. The app reads it as "signed out" and, if `GET /me` fails for any other reason
   (offline, 5xx), as "could not find out": it does not send the teacher to sign in, it asks to try again.
3. `role` can also be `admin` or `staff` in the type. School admin is out of v1 (the plan), but an admin signs in through the
   same screen, and the callback matches "invited teachers and admins" (FR-AUTH-03). OPEN, for the planner: should the teacher
   app's sign-in accept an `admin` or `staff` account? Today the app would show such an account the teacher screens with no
   courses. Proposed for v1: the callback accepts only `role = teacher` for a `return_to` of `/teacher` and refuses the rest as
   `unknown_email`.
4. `first_run_done` is false for a teacher the admin has just invited, and that is the only time it is false (F-01 step 3,
   FR-SUP-03): create the User with `first_run_done = false`.

## D. `first_run_done`

1. `PATCH /me` with `{ first_run_done: true }` (the gap B.3 of `handoff-pending-2.md`). The response body is ignored; the app
   re-reads `GET /me`. Idempotent: setting it when it is true changes nothing and is not an error. Nothing sets it back to false:
   the guide can be shown again from Settings ("Прикажи го водичот повторно") without touching the flag. Any other body is
   `validation_failed` (422). The student's `PATCH /me/profile` and `PATCH /me/settings` are separate and unaffected.
2. The app sets it when the teacher finishes the guide (its third screen) or skips it. A teacher who leaves in the middle has
   not finished: `first_run_done` is still false, and the guide shows again at the next load (the app sends a teacher with a
   false flag to the guide from every page but sign-in and Help). If the call fails (offline), the app stays on the guide and says
   so; it never leaves with the flag unsaved, because it would be sent straight back.
3. What the spec says the guided first lesson is: only that "the client starts the guided first lesson (F-03)" when the flag is
   false (F-01 step 3) and that there is a flag (FR-SUP-03). It says nothing else. So step 3 builds a three-screen welcome (prepare
   a lesson, hold it with the class scanning the QR, see who was there and what to repeat) and hands off to Today, whose one yellow
   button is "Подготви лекција". The hands-on part (the teacher making a first lesson with the AI) needs F-03's screens, which
   steps 5 and 6 build; see "What later steps must add" below. No API difference.

## E. Error codes

No new code. The sign-in uses:

| Code | Where | The app says |
|---|---|---|
| `unauthenticated` (401) | `GET /me`, and any call | Signed out; mid-use: "Ве одјавивме поради безбедност. Најавете се повторно." |
| `unknown_email` | only as `?error=` on the redirect back | the sentence in A.4, with the title "Оваа сметка не е на списокот" |
| `sign_in_failed` | only as `?error=` on the redirect back | "Најавувањето не успеа или е откажано. Обидете се повторно." |
| `validation_failed` (422) | `POST /auth/start`, a provider that is not `google` or `microsoft` | "Нешто од внесеното не е во ред..." (cannot happen from the app's buttons) |
| `rate_limited` (429, `Retry-After`) | `POST /auth/start` | "Премногу обиди. Почекајте {n} секунди и обидете се повторно." |

## F. What the demo plays, so the backend can read it

`lib/teacher/api/mock-session.ts` is the sign-in; its tests are `tests/unit/mock-session.test.ts`. A press opens a sheet that
stands for the provider's page and returns the way the callback does. The choices are the two invited teachers (one with a
season of lessons and results, one new: no lessons, no history, `first_run_done = false`), an account nobody invited and a
personal one (both `unknown_email`), a closed provider window (`sign_in_failed`) and no internet. Until somebody is signed in
every call but `startSignIn` and `signOut` answers 401 `unauthenticated`, and the session is kept apart from the demo's data, so
"Reset the demo data" does not sign anybody out.

## G. What later steps must add (for the planner; not the backend)

1. Step 5 and 6 (prepare a lesson): the guided first lesson of F-03 proper. When it exists, the third guide screen should lead
   into it ("Подготви ја првата лекција" to `/teacher/lessons/new`) for a teacher whose first run is not done, and Today (step 4)
   should keep the one yellow "Подготви лекција". Until then the guide ends on Today, as the brief says.
2. Step 7 (the live lesson): the projected class view is a second window of the same browser. It is a protected page like every
   other (the gate closes any path under `/teacher` except sign-in and Help), so it finds the session cookie of the console's
   window, and a session that ends while it is open sends it to sign-in. That is right, but it should not be a surprise.
3. Every new page needs nothing to be protected. A page that must be open to everyone has to be added to `accessOf` in
   `lib/teacher/guard.ts` on purpose.
4. A deep link keeps its path and drops its query (`next` is a path of the app, no query, so that it cannot be bent into an open
   redirect). A step that puts state in a query must either put it in the path or extend `safeNext` with a checked query.
5. CSP: before the live adapter is switched on, `next.config.ts` adds the API's origin to `connect-src` and `img-src`
   (`handoff-pending-2.md` A.14). The sign-in redirect itself is a navigation and needs nothing.
