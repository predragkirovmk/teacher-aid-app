# Handoff changes from step 10 (privacy and consent), for the 2.0 rewrite

Written for the session that is rewriting `backend-spec-for-agents.md` and `backend-guide-for-developer.md` to 2.0. Nothing here was
applied to 2.0. Everything is PROPOSED unless marked DECIDED. Section numbers and IDs refer to the 1.8 and 1.9 files.

## 0. What is already in the 1.9 files on disk

Before the owner's decisions of 27 Oct reached this step, a first version of this material was written into both files as 1.9
(spec: 3.1 `NoticeAcknowledgement`, US-S11, F-16 note, F-18, 7.21 FR-PRIV-01..08, BR-PRIV-02..09, EC-PRIV-01..07, AC-PRIV-01..08, 11.1,
11.3, 12 rows, 13.4, 13.5 G, OPEN-24..31, changelog 1.9; guide: a section on the notice and "Your data", rules, edge cases, checks,
open questions 24..31, changelog 1.9). Use this file instead of it where they differ. What in 1.9 is superseded:

- FR-PRIV-04 and AC-PRIV-06 list `reasons` in the data summary. There is no opener, so there are no reasons: drop the field.
- `answers` in FR-PRIV-04 reads "answers and opener votes": it is answers.
- F-18, EC-PRIV-01 and the guide's flow say the student signed in with an emailed code. Sign-in is Google or Microsoft (section 3).
- 7.21 and the notice told students that staff access is visible to the school admin. It is not (section 5).
- BR-PRIV-04 mentions the opener nowhere, but check 13.4's focus and anonymous-question texts still make sense without it.
- OPEN-24..31 were written for minors only (section 7 has them again, with the university case).

## 1. Who uses it, and the words

DECIDED 27 Oct: secondary schools and universities. At a university: faculty = school, professor = teacher, study group = class,
faculty admin = school admin, the dean gets the monthly report (the headmaster's role). The student app's notice and terms say this
in one sentence and otherwise use the school words. The notice cannot assume the reader is a minor: the sentence about telling
parents starts "If you are not yet an adult", and the age of digital consent (OPEN-25) is conditional on a school having minors and on
anything being consent-based.

## 2. What the student app calls (all PROPOSED)

### `GET /me` gains `acknowledgement`

`acknowledgement: { notice_version, acknowledged_at } | null`: the student's latest acknowledgement by time, `null` for a student with none
(a first sign-in). The wire is snake case with an ISO time; the app reads a server that sends no field as `null`.

### `POST /me/acknowledgements`

- Body `{ notice_version }`: a string of 1 to 32 characters of letters, digits, dots, dashes and underscores, else `validation_failed` (422).
- Stores one row per (student, version), append-only, with the server's time. 201 `{ notice_version, acknowledged_at }` the first time;
  the same version again is 200 with the stored row and changes nothing.
- 401 `unauthenticated` or `signed_in_elsewhere` for a student who is not signed in; `rate_limited` applies.
- The app then reads `GET /me`.

### Notice versioning

One version string for the privacy notice and the terms together, a date (the app's constant `NOTICE_VERSION`, now `2026-10-27`). The
server stores whatever it is sent and never judges which version is current: the text ships in the app. The app compares the version
in `GET /me` with its own and shows the first-sign-in screen again when they differ, saying the notice was updated. The server keeps
the rows, so there is a record of who saw which version and when. Where the text of a version is kept is the app repository's history
(open question 30 below). The screen never interrupts a lesson or a practice set in progress; it waits for the student to leave it.

### `GET /me/data-summary`

Own data only, counts only, no student id parameter:

    { attendance, answers, questions_to_teacher, focus_events, practice_answers, notifications, push_subscription }

Integers, and a boolean for the last. `attendance`: lessons the student was marked present or late at. `answers`: answers to quiz
questions. `focus_events`: `lost` events only. `push_subscription`: a push token exists. Never the content of a record:
BR-ANON-06 stands, so the text of a question to the teacher is returned by no student endpoint. The counts must come from the same
tables the teacher's views read, so what the student is told matches what the school can see. There is no opener, so no vote or
reason count.

### No export or delete endpoint

DECIDED (feature-spec 11.5, F-16): a copy or deletion is asked of the school and done by staff on the school's written request. The
student app has no button for it, says so on "Your data" and in the notice, and the backend must not add a student endpoint for it
(FR-PRIV-07). An export or deletion (FR-STF-03) covers every record that carries the student's id, `NoticeAcknowledgement` and
`PushToken` included, and the backups on their schedule (FR-DATA-02).

### "Clear data on this phone" and the server

The app removes what it saved on the phone (the unsent answers and questions after a warning, the focus queue, caches, local and
session storage but the language) and first sends `DELETE /me/push-token`, as a sign-out does (BR-NOT-05). It changes nothing else on the
server: `notifications_on` stays, and the student stays signed in. Answers not yet sent are lost, and the app says so first.

## 3. Sign-in is Google or Microsoft (DECIDED 27 Oct)

Students and teachers sign in with Google or Microsoft (school Workspace or Microsoft 365). No emailed codes, no passwords. This is
OPEN-01 closed. For the privacy side:

- The notice says "You sign in with your school's Google or Microsoft account. The sign-in itself happens at Google or Microsoft, so
  we never see your password", and that the app then keeps one sign-in cookie.
- Google and Microsoft become services that handle sign-in data for the school: they belong in the sub-processor list (open question 28).
  What the app receives from them (name, school email, class from the roster) must be stated in the data agreement.
- The student app still has the emailed-code sign-in in the code and the demo. It is not mentioned in any new text and is to be replaced
  in a later step; the unknown-email, `signed_in_elsewhere` and one-session rules (BR-AUTH-03) are unchanged.

## 4. What the notice says, so the backend can keep it true

Each line is a promise the backend must keep, or the notice and its version change in the same release (BR-PRIV-04):

- The school is the controller and TeacherAid the processor under a data agreement. Informing, not consent (BR-PRIV-03).
- Collected: school account (full name, school email, class, school); display name and photo (optional); attendance (time of QR check-in);
  answers (right or wrong, time taken) and points; results by topic; questions to the teacher stored with the sender; times the student
  left the quiz during an open question (type, time, question; nothing about other apps); practice answers; alerts; the push
  subscription; one sign-in cookie. There is no opener, so nothing about votes or reasons.
- Points: 10 for a right answer plus up to 5 for speed; badges give points; practice sets give no points (DECIDED 27 Oct). The notice
  says "answers and points" and that practice answers are seen by the teacher; it names no points for practice.
- Who sees what: the teacher sees all of it for their own lessons; classmates see only the name, points and place on the class board and
  earned badges, never answers, questions, results, attendance or focus events; the school admin (faculty admin) sees class lists, account
  details and teacher usage, never answers, questions or per-topic results; the dean or headmaster gets a monthly report of totals
  without names; staff have no standing access, only a time-limited grant for a reported problem, **logged on TeacherAid's side**.
- Not collected: grades, contact details beyond the school email, location, contacts, anything about other apps, any device identifier
  beyond the push subscription. No ads and no tracking tools in the app.
- Stored in the EU, encrypted in transit and at rest (BR-SEC-01). The AI provider never receives names, emails or class lists
  (BR-SEC-04); AI helps teachers prepare lessons from their own material or a topic they type (no e-textbooks).
- Retention as BR-RET-01 (until the end of the school year after the one the data was made in, then deleted or aggregated without names),
  BR-RET-02 (reports without names), BR-RET-03 (a leaver: deleted within 30 days of the school's request); the push address until the
  student turns notifications off or signs out (BR-NOT-05); backups expire on a fixed schedule (no number stated).
- Requests go through the school, who send staff a written request (F-16). The notice lists the rights in general GDPR-aligned terms and
  the right to complain to the Personal Data Protection Agency of North Macedonia (azlp.mk).
- The contact: the school first; `hello@teacheraid.education` for questions about the app (PROPOSED, taken from the marketing site).

## 5. Staff access (changed 27 Oct)

DECIDED: the school admin does **not** see a staff-access log. Staff access is still granted per incident, time-limited and audited,
but the audit log is TeacherAid's own. So:

- Remove the school admin's staff-access log from 2.2, FR-ADM-09, US for the school admin, AC-SEC-03's "the school admin can see it" and
  BR-SEC-03's "visible to the school admin". Keep the grant, the expiry and the audit log (`AuditLog`, `StaffAccessGrant`).
- The notice therefore says only "every look is logged on TeacherAid's side". It promises no visibility to the school.
- Consider whether the school should at least be told when a grant is opened for its data (a notification or email, not a log):
  not decided, and it affects what can be promised in the data agreement (open question 26).

## 6. Support (changed 27 Oct)

DECIDED: the student app has an email link and an FAQ only. There is no support endpoint: drop FR-SUP-02's "create a support request and
alert staff" for the student app, `SupportRequest` for students, and OPEN-21 for them. The notice's contact is the same email link.

## 7. Rules, edge cases, acceptance, as they should read in 2.0

Rules (all PROPOSED unless marked):

- BR-PRIV-02 DECIDED: no self-service export or delete.
- BR-PRIV-03 INTERPRETATION, pending OPEN-24: the first sign-in is a notice with an acknowledgement (a version and a time), not a consent.
  No consent checkbox. A school that needs consent runs its own form outside the app.
- BR-PRIV-04: the notice follows the permission matrix, hard rules 3 and 4, BR-FOC-07, BR-ANON-06 and BR-NOT-02; changing any of them
  changes the notice and its version in the same release.
- BR-PRIV-05: one version string for both documents, a date; the app compares and re-shows.
- BR-PRIV-06: no attendance, answer or focus event is recorded for a student who has not been shown the current notice. The notice comes
  before a check-in link's join. The server cannot check it.
- BR-PRIV-07 (values not in the spec): acknowledgement rows live as long as the account and go with the student's data under BR-RET-03;
  notifications go with session data (BR-RET-01); the push token goes as BR-NOT-05; server log retention is open (OPEN-29).
- BR-PRIV-08: clearing a phone, section 2 above.
- BR-PRIV-09 INTERPRETATION: no cookie banner. The app sets one functional cookie (the sign-in session, FR-AUTH-08) and its CSP allows
  no third-party origin; there are no analytics or advertising tools. Fonts are self-hosted. Adding analytics, error reporting (the
  app has a seam for it, off without a DSN) or any outside service changes this and the notice. Google and Microsoft sign-in is a
  redirect, not an embedded script, and sets cookies on their own domains.

Edge cases:

- EC-PRIV-01: a first sign-in from a class QR. The notice comes first and the join waits for Continue, so the 30-second code may have
  rotated and the student scans again. Pilot advice: sign students in before the first lesson (open question 31).
- EC-PRIV-02: the acknowledgement cannot be sent: the student stays on the notice with the error; Continue tries again.
- EC-PRIV-03: the notice changes during a lesson or practice set: it waits.
- EC-PRIV-04: an old or unknown version is accepted and stored.
- EC-PRIV-05: the same version twice (a lost reply, two phones) is one row; the second answers 200.
- EC-PRIV-06: clearing the phone with answers not sent: warned first; if they go on they are dropped and never reach the server.
- EC-PRIV-07: a shared phone: a signed-out student's unsent answers stay on the phone under their id and are sent only when they sign
  in again (BR-NET-05); the notice says so and a student can clear the phone.

Acceptance:

- AC-PRIV-01: no acknowledgement gives `null` on `GET /me`.
- AC-PRIV-02: a first `POST` gives 201 and `GET /me` carries it; the same body again gives 200 with the first row and still one row.
- AC-PRIV-03: a 33-character, empty or spaced version is `validation_failed` and nothing is stored.
- AC-PRIV-04: two versions give two rows and `GET /me` carries the later.
- AC-PRIV-05: both endpoints answer 401 to a signed-out caller.
- AC-PRIV-06: a student with 20 attendance marks, 31 answers, 1 question to the teacher, 3 `lost` events, 6 practice answers and 9
  notifications gets exactly those counts from `GET /me/data-summary`, and `push_subscription` is true only while a token exists.
- AC-PRIV-07: a question to the teacher is counted and its text is returned by no student endpoint.
- AC-PRIV-08: after a deletion request (F-16) is done, no record with the student's id remains, acknowledgements and push token included.

Section 12 rows: Privacy notice and Terms (static text in the app, in Macedonian and English, readable signed out, no API; their version
is the app's `NOTICE_VERSION`); First sign-in notice (`acknowledgement` on `GET /me`, `POST /me/acknowledgements`); Your data (`GET /me`,
`GET /me/data-summary`, `DELETE /me/push-token` from the clear button).

## 8. Open legal questions, for 2.0's section 14 and 13.4 (OPEN-24 to OPEN-31)

None of these is settled. The notice is written so that it says only what the spec decides.

- OPEN-24 Lawful basis, and whether any school or university needs a consent step. Built on: the school is the controller, relies on its own
  mandate, and the first sign-in is a notice with an acknowledgement. Private schools "often" want explicit consent (data-and-privacy); a
  university's basis may differ from a secondary school's. A lawyer and the pilot school decide. If consent is needed, the first sign-in
  needs a real consent step, and for minors a parent's.
- OPEN-25 The age of digital consent under ЗЗЛП (GDPR default 16, states may lower it to 13). The `snovi-privacy` skill says 14 for
  information-society services and is unverified: do not quote it. Conditional: it matters only for secondary-school students and only if
  something is based on consent. At a university the students are mostly adults.
- OPEN-26 Wording of the data agreement (ДПА) clauses: per-topic assessment data on minors, questions stored with the sender, the focus
  flag (13.4 has proposed texts). With the opener gone, drop any clause or text that mentions votes or reasons. The notice must say no
  more and no less than the signed clauses; also decide what is promised to a school about staff access now that it has no log (section 5).
- OPEN-27 Who is named as controller and processor, and the privacy contact. TeacherAid's legal entity, address and a privacy contact are not
  set; the school's contact or data protection officer is not known. The notice sends students to the school office and gives
  `hello@teacheraid.education` (PROPOSED).
- OPEN-28 Sub-processors and transfers: hosting and realtime (EU, BR-SEC-01); Google and Microsoft for sign-in (new, DECIDED method);
  push services of Apple, Google and Mozilla; the AI provider (OPEN-17, receives no personal data); an error-reporting service if one is
  chosen. The notice says only what is decided.
- OPEN-29 Retention and response times the spec does not give: notifications, acknowledgements, server logs, backups (FR-DATA-02), and the
  legal time in which the school must answer a student's request. Also: may a student see the count of their own focus events? The
  permission matrix gives students no access to focus events; "Your data" shows a count, nothing more.
- OPEN-30 Whether the notice's list of rights and its pointer to the Personal Data Protection Agency (azlp.mk) say what the law says, and where
  the history of the notice's versions is kept. A signed record of what each student saw would need the text stored beside the version.
- OPEN-31 The student terms: who they bind, whether they need liability, intellectual property or governing-law clauses, and what happens when
  a rule is broken. The terms are a few rules (be yourself, be respectful, keep the class code in class, play fair) and leave consequences
  to the school. Also whether a pilot signs students in before the first lesson (EC-PRIV-01).

13.5: add assumption G, "The school is the controller and its lawful basis is not the student's consent (OPEN-24)". What breaks if wrong:
the first sign-in needs a real consent step, and for minors below the age of digital consent a parent's.

13.4: the notice depends on the signed ДПА, the age of consent (conditional, see OPEN-25), the controller and processor details, and the
sub-processor list. A lawyer and the school confirm these before launch; the notice must not get ahead of them.

## 9. Changelog row for 2.0 (to merge into whatever 2.0 says)

Student app step 10 (privacy and consent): the notice and terms in the app (school is controller, informs, no consent box), `acknowledgement`
on `GET /me`, `POST /me/acknowledgements` and notice versioning, `GET /me/data-summary` (no reasons: no opener), no student export or
delete, clearing a phone, no cookie banner and why, Google and Microsoft sign-in described, school-and-university words, no staff-access
log for the school admin, no support endpoint, and OPEN-24 to OPEN-31.
