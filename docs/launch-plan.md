# Launch plan: AI lesson generation goes live

2026-11-07. What was checked today on both apps, what was fixed, and the steps that take the teacher app (desktop) and the
student app (phones) from the demo to the real backend with the AI.

## Where things stand

Checked on `main` at 48dadce (PR #4 merged), in a clean copy:

| Check | Result |
|---|---|
| Lint (eslint) | clean |
| Type check (`next typegen && tsc`) | clean |
| Unit tests (Vitest) | 1,491 passed, plus 15 new for the teacher live adapter |
| End-to-end, student app on an iPhone screen and teacher app on a 1280x720 laptop (mock) | 663 passed, 0 failed, 4 skipped on purpose (the typed class code is switched off, OPEN-03) |
| End-to-end, student app in live mode against the fake API | 84 passed, 0 failed |
| Teacher app in live mode against a fake AI backend (the first time it has run live) | works: sign-in round trip, Today, typed material, the wait and its polling, the editor, autosave, "Потешки" and its undo, a failure and Retry, Save |
| CI on `main` | green |
| Production, teacheraid.education | up; `/`, `/teacher`, `/app`, both manifests and both offline workers answer 200; security headers and CSP in place; no runtime errors in the last 7 days |

Fixed today (branch `launch-check`, not pushed):

- **A long draft could never save in live mode.** Autosave sends the draft with `keepalive`, and browsers refuse a `keepalive`
  request over 64 KB, failing it as if offline. A teacher who pasted a long review text would see "not saved" for good and
  Save would fail. The live adapter now drops `keepalive` for a body over 60 KB. The mock never sends a request, so no test
  could have caught it.
- **The teacher live adapter had no tests.** It is the only code that will talk to the real lesson API, and nothing ran it.
  15 tests now pin every lesson-job call, cookies, error reading, timeouts, cancelling and the realtime stream.

Fixed 2026-11-08 (same branch, not pushed):

- **A live build serves only the two apps** (step B2). Every other path redirects (307) to `https://teacheraid.education`
  with its path kept, and robots.txt answers `Disallow: /`. The demo build is unchanged. Tests: `tests/unit/live-build.test.ts`.
- **A draft or lesson in the wrong shape no longer stops the page.** The live adapter checks every draft and lesson against
  11.5 before a screen reads it (`lib/teacher/api/shape.ts`). One that does not match, a number for `correct` among them, is
  `invalid_response`: the draft page says "Добивме одговор што не го разбираме" with Try again, and the console message names
  the first wrong field (`draft: questions[0].correct is not text`). The backend must still send strings (step A3).
- **The wait has a limit of its own.** A draft still `pending` 4 minutes after the page began to wait (the server's 3, plus a
  minute) shows "Ова трае предолго", with the way back to the form, everything kept, and "Чекај уште". The page keeps asking,
  so a draft that comes late still opens. The demo shows it with `[stuck]` in the typed text. The server must still fail a
  draft at 180 s (step A2): the app's limit is only there so that a dead worker cannot leave a teacher waiting for good.
- **A 409 with no body is `invalid_state`**, the spec's code, not `validation_failed`.

Found in the live run (a spec-faithful fake API, the app built with `NEXT_PUBLIC_API_MODE=live`):

- The 64 KB limit is real: in Chrome the same 70 KB draft fails with `keepalive` ("Failed to fetch") and saves without it.
  After the fix a 70 KB draft autosaves and shows "Промените се зачувани".
- Refine sends the teacher's last edit first, then the refinement (BR-LES-20), and Save makes the lesson and opens it.
- The app accepts only an `https:` sign-in address from `POST /auth/start`. Correct, but a local backend over plain http cannot
  sign in through the button; the developer needs https locally or to call the callback directly.
- **A draft whose `correct` is a number crashes the draft page** ("Нешто не е во ред", `correct.trim is not a function`). The
  AI spec's own output schema (3.1) writes the answers as numbers, so a backend that stores the AI's output as it comes would
  break every draft. See step A3.

## What is not ready (blocks the AI launch)

1. **There is no backend yet.** `teacheraid-backend` holds the handoff documents only. Both apps run on the in-browser mock.
2. **Production has no live settings.** Vercel has none of `NEXT_PUBLIC_API_MODE`, `NEXT_PUBLIC_API_URL`,
   `NEXT_PUBLIC_VAPID_PUBLIC_KEY`. They are read at build time, and one build serves both apps, so setting them on the
   current project would switch the teacher app, the student app and the public demo to the real API together.
   **Decided 2026-11-08:** the real app gets a second Vercel project on `app.teacheraid.education`; the current project
   stays the demo the website and the AI guide link to.
3. **Where the API lives decides whether phones stay signed in.** The session is a cookie on the API's origin. If the API is
   on another site (say `teacheraid-api.eu`), the cookie is third-party: Safari blocks those outright, whatever `SameSite`
   says, so every student on an iPhone would be signed out on each request. Put the API on `api.teacheraid.education`
   (same site, `SameSite=Lax`, and no CSRF work, FR-AUTH-15). DNS stays at Spaceship; add one record.

## Decisions for you

| Decision | Recommendation |
|---|---|
| Keep the public demo once the real app is live? | **Decided 2026-11-08: yes.** The real app runs as a second Vercel project on `app.teacheraid.education` with the live settings; `teacheraid.education/teacher` and `/app` stay the demo. One code change comes first (step B2). |
| API address | `api.teacheraid.education` (point 3 above). |
| AI provider and region (OPEN-17, BR-SEC-01) | Claude, called through the backend only. The first-party Claude API runs inference `global` or `us`, with no EU-only option; for EU-only processing use Claude on Google Vertex AI (`region: "eu"`) or on Amazon Bedrock in an EU region, and confirm the model is offered there when the account is set up. Start with `claude-opus-5-5` ($4 in / $20 out per million tokens) with structured output (`output_config.format`) and the system prompt cached. Measure on real Macedonian lessons before choosing anything cheaper. |
| Content language (OPEN-32) | Macedonian for v1, with `language` kept a parameter, as the spec says. |
| A spending cap per teacher | Not for launch; record tokens per school from day one (FR-LES-12) and decide after the first month. |

## Launch steps

### A. Backend (the developer, against `backend-spec-for-agents.md` 2.13 and the AI spec 1.0)

1. Auth for teachers and students: Google and Microsoft, `HttpOnly` cookie on `api.teacheraid.education`, CORS with
   credentials for `https://app.teacheraid.education` only, `Retry-After` in `Access-Control-Expose-Headers`. The demo on
   `teacheraid.education` never calls the API, so its origin is not allowed.
2. The lesson job: `POST /lessons/sources`, `POST /lessons/generate` (202, `pending`), a worker, `GET /lessons/drafts/{id}`,
   refine, retry, `DELETE`, `PATCH`, `GET /lessons/drafts`, `POST /lessons`. The rules that matter most on day one:
   - one retry, then `failed`; never a `ready` draft that fails the schema (AC-LES-03);
   - a draft pending over 180 s becomes `failed` on the server. The app polls every 2.5 s while a draft is pending; at 4
     minutes it stops showing the wait and offers to go back, but only the server can turn the draft `failed`;
   - a second generate for a pending source answers the same draft (AC-LES-04);
   - nothing about students in the AI request (AC-LES-02, asserted on the serialized request).
3. Convert the AI's output to the wire shape of spec 11.5 before it is stored. The AI spec's schema (3.1) gives the
   multiple-choice answer as a number and the numeric answer as a number; the app reads `correct` as a **string** (`"0"`,
   `"3.5"`) and needs `id` and `order` on every question, `subject` as `{ id, name }` and `source` as `{ kind, file_name }` on
   the draft. Passing the AI output through unchanged used to crash the draft page (checked in the live run); since
   2026-11-08 the app refuses such a draft as `invalid_response`, so the teacher sees an error instead of the questions.
   Say this in the AI spec too, so the developer cannot miss it.
4. Join tokens only from `[A-Za-z0-9-]` (BR-JOIN-08). The student app's scanner refuses anything else, so a base64 token with
   `_` or `+` would make every QR scan fail.
5. The rest of the student endpoints the released student app already uses (sessions, answers, realtime, push), then the
   teacher's live-lesson endpoints.

### B. Before the first real lesson

1. Merge `launch-check` (the keepalive fix, the adapter tests, and the four fixes of 2026-11-08 above).
2. Done 2026-11-08 on `launch-check`: a live build serves the two apps and nothing else. The second project runs the same code, so
   `app.teacheraid.education` would also serve a second copy of the website, open to search engines (robots.txt allows
   everything there and the pages carry no canonical link), an early-access form that loses every signup (that project
   has no Redis), and the old Startup Weekend demo with the host key written in the code. In a live build, send every
   path outside `/teacher`, `/app` and the files they load to `https://teacheraid.education`, and let robots.txt disallow
   everything. The demo build is unchanged.
3. Run the teacher app against the real API on a preview: `NEXT_PUBLIC_API_MODE=live`, `NEXT_PUBLIC_API_URL=https://api.teacheraid.education`.
   The steps of the smoke run above, by hand: sign in, prepare from typed text, prepare from a PDF and a .docx, wait, edit,
   each refinement and its undo, a failure and Retry, cancel the wait, save. Then a lesson end to end with two phones.
4. Generate VAPID keys; the public one goes in `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, the private one stays on the server.
5. Add the provider to the privacy page's sub-processor list (OPEN-28) once the provider and region are chosen.
6. DMARC record for teacheraid.education (none yet).

### C. Launch day

1. Create the live Vercel project from the same repository (production branch `main`), set the three variables for
   Production, deploy, add the domain `app.teacheraid.education` and the record Vercel asks for at Spaceship. Leave the
   current project's variables as they are.
2. Check `/teacher` and `/app` on it: headers, CSP carries the API origin in `connect-src` and `img-src`, sign-in round trip on a
   laptop and on an iPhone.
3. One real lesson prepared from a real plan, checked by a teacher before any class sees it (BR-LES-04).
4. Watch the API's error rate, the share of drafts that end `failed`, generation time and tokens per school for the first week.

## Also noted (not blockers)

- The old demo's host key falls back to a default written in the code when `HOST_KEY` is empty, and the repository is public.
  It only guards the old `/host` demo's reset and advance; set `HOST_KEY` in Vercel or retire that demo.
- Fixed 2026-11-08: a 409 with no body was read as `validation_failed`; it is now `invalid_state`, the spec's 409.
