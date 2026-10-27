# Handoff changes from step 10b (the owner's decisions of 27 Oct), for the backend documents after 2.1

Written against `backend-spec-for-agents.md` and `backend-guide-for-developer.md` version 2.1 (brain commit cfc638d), which are not edited from
this repository. Everything here is PROPOSED. IDs are the 2.1 ones. Most of the owner's decisions were already in 2.0 and the app now
matches them (no opener, Google or Microsoft only, practice gives no points, 10 plus up to 5 for speed, badges score, universities, support
is an FAQ and an email). What follows is only where the student app, as built, needs something 2.1 does not say.

## 1. The student sign-in starts from a provider button, not from a typed email

2.1 (F-02, FR-AUTH-10, 11.3, AC-AUTH-08) has the student type the school email, and `POST /auth/student/start` find the school from it
and redirect to the school's provider with the email as a login hint. The owner asked for the sign-in screen to be two buttons, "Continue
with Google" and "Continue with Microsoft", with nothing to type. The app therefore knows no email when it starts, and the school is not
known until the provider has said who the student is. What the app sends and expects:

    POST /auth/student/start   { provider: "google" | "microsoft", return_to? }   ->  200 { method: "redirect", url }

- `provider` is required. `school_email` is not sent; drop it from the body. `validation_failed` (422) for any other provider.
- `url` is the provider's own sign-in address for that provider (no login hint). The app sets `window.location` to it.
- The school is found at the callback, from the ID token: the account's email must be on a roster (FR-AUTH-03, FR-AUTH-04). FR-AUTH-10
  still holds as a check: an account of the wrong provider for its school, or of no school, is on no roster and is `unknown_email`.
- So `unknown_email` is no longer a 404 on `start`. It only arrives as `?error=unknown_email` on the redirect back (EC-AUTH-02, EC-AUTH-09).
  `start` can still answer `validation_failed` and `rate_limited`.
- FR-AUTH-09 / EC-AUTH-07: with no email, `start` can only be rate limited per address, not per email. The callback is also worth limiting.
- AC-AUTH-08 reads: given a student of a school that uses Microsoft, when `start` is sent with `provider: "microsoft"`, the answer is a
  redirect to Microsoft; after the callback the session cookie is set and the browser lands on `return_to`.

Teachers and admins (`POST /auth/start`) are not built in this app; the same question applies to them when they are.

## 2. `return_to` is the welcome screen and carries a query

The app sends the path of its own sign-in screen with the screen the student was heading for in its query, for example
`/app/welcome?next=%2Fapp%2Fcheckin%2F7K2Q` (a class QR opened while signed out). This is how a QR link continues the check-in after the
sign-in (EC-JOIN-05) and how a refusal is shown on the sign-in screen and not on the check-in link.

- `return_to` always starts with `/app` and may hold a `?`. The callback must accept that and keep the query as it is.
- On a refusal the callback appends `error=unknown_email` or `error=sign_in_failed` to `return_to` with `&` when it already has a `?`, else
  with `?`. The success redirect is `return_to` unchanged. It must still be the app's own origin, and nothing else may be accepted.
- The app removes `error` from its address once it has read it and ignores any other value there.

## 3. Codes the app no longer expects, and one it now reads from the address

`invalid_code` and `code_expired` are gone from the app with the emailed code; they are not needed on the wire. `sign_in_failed` is read
only from `?error=` on the redirect back (11 already lists it); it is never an HTTP error body. `unknown_email` is read from the same place.

## 4. Nothing needed for the rest

- No opener: the app reads no `opener`, `my_reason`, `reason_points`, `opener.counts`, `opener.reasons` and no `opener` session state or
  question kind. `question.result.correct` is now always a boolean. `session.state` is `lobby`, `teaching`, `review`, `ended`.
- Practice: the app reads no `points` on `GET /me/practice-sets` or in the answers response, and shows right or wrong with the explanation.
- End (BR-END-01) is the teacher's list. The student's End screen is unchanged: the tally, the place in the quiz, the points, the summary.
- Support: the FAQ screen ends with a link to `hello@teacheraid.education`. No endpoint.
- Universities (BR-UNI-01): the app labels the two names on `GET /me` "School or university" (`school.name`) and "Class or group"
  (`class.name`). At a faculty these should hold the faculty's and the study group's names.
