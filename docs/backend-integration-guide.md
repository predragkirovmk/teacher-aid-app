# Connecting Supabase and the AI to the TeacherAid app

For the backend developer and their coding agents. Written 2026-11-20, a few days before the real app launches.

The database (Supabase) and the lesson AI are built. This file says how to connect them to the frontend that ships, which is
frozen: no frontend change is planned before launch, so the backend adapts to it, never the other way round.

Two files go with this one:

- **`docs/backend-launch-check.md`**: the exact contract, check by check (T1 to T7, D1 to D5, L, Q, E, J, S, P, H), with a
  report template. Run it first; this guide says how to build what it finds missing.
- **The frontend code** on `main` of the public repository: `lib/teacher/api/types.ts` and `lib/app/api/wire.ts` hold every
  shape, `lib/teacher/api/shape.ts` is the check the app runs on a draft, and `tests/fake-api/server.mts` is a small working
  server that answers every call the apps make. When this guide and the code disagree, the code wins.

Never copy a key, a secret, a connection string or a person's details into the repository, a commit, a report or a prompt.

## 1. The shape

```
Browser (app.teacheraid.education)
   |  HTTPS, JSON, one HttpOnly cookie, Server-Sent Events
   v
API service (api.teacheraid.education/api/v1)   <- the only thing the browser talks to
   |-- Supabase Postgres   (data; the service connects with a server-side key)
   |-- Supabase Storage    (uploaded lesson files, question pictures, profile photos; private buckets)
   |-- Supabase Auth       (optional: only the Google and Microsoft sign-in handshake, section 3)
   |-- AI provider         (lesson drafts, from a background worker, section 5)
   '-- Web Push            (VAPID, section 7)
```

Rules that follow from it:

- **The browser never talks to Supabase or to the AI.** No supabase-js, no PostgREST, no RPC, no Supabase Realtime, no anon or
  publishable key in the frontend. The frontend has no code for any of it (check T1).
- **The service holds every key.** The Supabase secret (service-role) key and the AI credentials live in the service's
  environment only.
- **The service does the access control.** A service-role key bypasses Row Level Security, so every query filters by the
  signed-in user: a teacher reads and changes only their own drafts, lessons and sessions; a student only their own data and
  the sessions they joined. Write this once, in the data layer, and test it.
- **Row Level Security stays on as a backstop.** Enable it on every table in an exposed schema and add no policy for `anon` or
  `authenticated`, so the public Data API returns nothing even if someone finds the project URL. Every Storage bucket is
  private.

## 2. Where the service runs

The service has three jobs that run for a long time: the realtime stream (open for a whole lesson, 45 minutes or more), the
AI worker (up to 180 s a draft), and a one-second timer that ends questions and rotates the join code. So:

- **Recommended: one small Node.js (TypeScript) service**, one instance, in an EU region close to the Supabase project
  (for example Frankfurt). Any host that runs a long-lived process and lets a response stream for an hour works. Put the REST
  routes, the stream, the worker and the timer in it. One instance is enough for launch and keeps the realtime fan-out in
  memory (section 6).
- **If the REST routes are already Supabase Edge Functions**, they can stay, but two things are still needed. First, a proxy on
  `api.teacheraid.education` that maps `/api/v1/...` to the functions: Supabase serves functions on its own host under
  `/functions/v1/<name>`, and the cookie must be set by `api.teacheraid.education` itself (check T2; a cookie from another
  site is not sent, and Safari blocks it). Second, the long-running service above for the stream, the worker and the timer,
  because an Edge Function has a wall-clock limit far shorter than a lesson (check Supabase's current limits). The functions
  and the service then need a shared message bus (section 6). Porting the handlers into the one service is usually less work
  than running both.
- **The domain.** `api.teacheraid.education` points at the service (or the proxy) with TLS. The app is on
  `app.teacheraid.education`; the two are the same site, which is what lets the cookie work in every browser.

Every route answers within 15 s (check T6). CORS for `https://app.teacheraid.education` only, with credentials, and
`Access-Control-Expose-Headers: Retry-After` (check T3). Every error is `{ "error": { "code", "message" } }` (check T4).

## 3. Sign-in

The frontend sends `POST /auth/start` (teacher) or `POST /auth/student/start` with `{ provider: "google" | "microsoft",
return_to? }`, expects `{ method: "redirect", url }` with an `https:` URL, and sends the browser there. It never reads a
token and never sends an `Authorization` header (checks T2, T7). The callback is `GET /api/v1/auth/callback/{provider}` on
the API (spec FR-AUTH-12), which sets the cookie and sends the browser back to the app.

### 3.1 With Supabase Auth (if it is already set up)

Use Supabase Auth only for the handshake with Google and Microsoft, run from the server with PKCE, then throw its session away
and issue the API's own cookie. In Supabase, the providers are `google` and `azure` (Microsoft, with the `email` scope), and
the redirect allow-list holds only `https://api.teacheraid.education/api/v1/auth/callback/google` and `.../microsoft`.
The Google and Microsoft apps list Supabase's own callback, as Supabase requires.

1. **Start.** Validate `return_to`: a path, not `//...`; a teacher's starts with `/teacher`, a student's with `/app`; default
   `/teacher` or `/app`. Make a server-side Supabase client (`@supabase/ssr`, `createServerClient`, with a cookie adapter that
   writes to this response), and call `auth.signInWithOAuth` with `skipBrowserRedirect: true` and `redirectTo` set to the
   API callback for that provider. It returns the provider URL and stores the PKCE verifier in a cookie on
   `api.teacheraid.education`. Keep `return_to` and the role (teacher or student) in a short-lived signed cookie as well
   (`HttpOnly; Secure; SameSite=Lax`, 10 minutes). Answer `{ method: "redirect", url }`.
2. **Callback.** Call `auth.exchangeCodeForSession(code)` with the same cookie adapter. Take the verified email and the
   provider from the returned user. Then apply the spec's rules: a teacher must be on the invited list with `role = teacher`
   and the school's provider (BR-AUTH-09), a student must be on a roster. Anything else redirects to
   `https://app.teacheraid.education{return_to}?error=unknown_email`; a cancelled or failed handshake to `?error=sign_in_failed`.
3. **The API's session.** Make 32 random bytes, store their SHA-256 in a `sessions` table with the user, the role and the
   expiry times, and set the raw value as the cookie: `HttpOnly; Secure; SameSite=Lax; Path=/`, host-only on
   `api.teacheraid.education`. Clear the Supabase auth cookies; the provider's tokens are not kept.
4. **Back to the app.** `302` to `https://app.teacheraid.education{return_to}`.

Pass the code above through the current `@supabase/ssr` documentation before using it; the names are what the library uses
today, but check them.

### 3.2 Without Supabase Auth

The same four steps with an OpenID Connect library talking to Google and Microsoft directly. Then the Google and Microsoft
apps list the API callback, and Supabase Auth is not used at all.

### 3.3 Every request after that

- Read the cookie, hash it, find the session row, load the user. None or expired: `401 unauthenticated`.
- **Lifetimes** as the spec says (BR-AUTH-07 for teachers: 12 hours idle, 30 days at most, the idle limit paused while the
  teacher has a lesson that has not ended). Every request and every open stream renews the idle time.
- **A student has one sign-in at a time.** A new student sign-in revokes the older ones; the older one's next request is
  `401 signed_in_elsewhere`, and its open stream gets `signed_in_elsewhere` on `student.{id}` and is closed.
- `POST /auth/logout` deletes the row, clears the cookie, answers `204`.

## 4. Data

- **One serializer per wire type**, written from `types.ts` (teacher) and `wire.ts` (student). The database can be shaped
  however suits it; the JSON leaving the service must match those files exactly, field for field.
- **Removed in the simplification** (checks 3.2, E1, 4.1): a course, class, subject or year on the prepare form,
  `review_summary`, the roster before students join, the reveal endpoint, the Review phase, practice sets made by the teacher
  app. Nothing may require them. `SessionState` is `lobby | teaching | ended`; `QuestionStatus` is
  `ready | open | revealed | skipped`.
- **Practice sets**: `GET /me/practice-sets` answers `[]` when there are none.
- When unsure what an answer looks like, start `tests/fake-api/server.mts` and call it.

## 5. The AI

The AI spec 1.0 still describes the pipeline (sources, limits, retention), with the changes in check 3.3. In short:

1. **Sources.** `POST /lessons/sources` takes JSON `{ text }` or a multipart `file` (PDF or .docx, up to 20 MB). Store a file
   in a private bucket under the teacher's id, extract its text on the server, and answer `{ source_id }`. Delete sources no
   draft uses after `SOURCE_ORPHAN_HOURS`.
2. **Generate.** `POST /lessons/generate { source_id, emphasis? }` inserts a draft with `status: "pending"` and answers `202`
   with it at once. A unique index on the source for pending drafts makes a second generate answer the same draft (D4).
   `retry` and `refine` work the same way; `refine` makes a new draft with `previous_draft_id` set.
3. **The worker** picks pending drafts (`SELECT ... FOR UPDATE SKIP LOCKED`, or a Supabase queue), calls the model with a time
   limit that leaves room for the one retry inside 180 s, and either saves the draft `ready` or tries once more. After the
   retry, or once a draft has been pending for 180 s, it is `failed` with `failure: "generation_failed"`. The app polls
   `GET /lessons/drafts/{id}` every 2.5 s, so that read must stay cheap.
4. **Structured output.** Ask the model for JSON that follows a schema (the provider's structured-output feature, not a
   prompt that asks nicely). Then convert before saving: give each question an `id` and an `order` from 0; turn `correct` into
   a string (`"0"` for the first option, `"true"`, `"3.5"`), since the AI spec's schema has numbers (D1); fill `topic`.
   Validate the result against the same rules as `shape.ts` (D2) and treat a failure like a failed call. A draft that is
   `ready` always passes.
5. **Nothing about students goes to the AI** (D5): the request holds the lesson text, the emphasis and the instructions, and
   nothing else. A test that inspects the serialized request is the proof.
6. **Provider and region.** The privacy page says data stays in the EU, and a teacher's notes can name people, so the
   lesson text should be processed in the EU too. If the model is Claude: the Claude API itself runs inference `global` or `us` only, with
   no EU-only setting. For EU-only processing use Claude through Google Vertex AI in an EU region or through Amazon Bedrock in an
   EU region, and confirm the model is offered there. The launch plan suggests `claude-opus-5-5` with the system prompt cached;
   measure Macedonian quality on real lessons before choosing anything cheaper.
7. **Code written for older Claude models** fails on `claude-opus-5-5` in two ways worth checking: a pre-filled assistant
   turn (often `{` to force JSON) is not accepted, and `thinking` with `budget_tokens` is rejected with a 400. Use structured
   output for the JSON and leave thinking at its default.

## 6. Realtime

- **The stream.** `GET /api/v1/realtime?channels=a,b` with the cookie. Check each channel: a teacher reads `.class` and
  `.console` of their own session; a student reads `.public` of a session they joined and `student.{their id}`; anything else
  is refused. Answer `Content-Type: text/event-stream`, `Cache-Control: no-cache, no-transform`, no compression on this
  route, and flush every write (behind nginx, `X-Accel-Buffering: no`). Each message is `event: <type>`, then
  `data: <one line of JSON>`, then a blank line. `event: ping` every 20 s. Nothing is replayed on reconnect (check T5).
- **The fan-out.** A map from channel to open streams. One `publish(sessionId, level, type, body)` helper adds `channel` and
  `server_now` and writes to the right channels: an event for `public` also goes to `class` and `console`, one for `class` also
  to `console` (check 3.8). With more than one process (Edge Functions plus the service, or two instances), carry events
  between them with Postgres `LISTEN`/`NOTIFY` (on a direct or session-mode connection, not the transaction pooler) or with
  Supabase Realtime broadcast used from the server side only; the browser still gets the SSE stream.
- **Presence.** A student's open stream on a session channel means online; when it closes, `student.presence` goes to the
  console.
- **The one-second timer** does two things:
  - **Ends questions** at `closes_at` (the answer handler does the same at once when every student there and online has
    answered). Make the change once with `UPDATE ... WHERE status = 'open' RETURNING`, then send, in this order,
    `question.progress`, `leaderboard.updated`, `question.closed` (public only) and `question.revealed` (checks Q2, Q3, Q6).
  - **Rotates the join code** every 30 s for each session that is not ended, and sends `join_token.rotated` on the class
    channel only (J1).
- **Join codes.** Keep them in a table: `token`, `short_code`, `session_id`, `valid_from`, `valid_to`. The token uses only
  `A-Z a-z 0-9 -` (J2; hex or base62, never standard base64); the short code is exactly six digits (J3), random, and not
  reused while it is still in the table (keep a day of them). `POST /sessions/join` takes `{ token }` or `{ short_code }`:
  current is a join, in the table but past `valid_to` is `token_expired`, not in the table is `not_found` (S3). The QR holds
  `https://app.teacheraid.education/app/checkin/{token}` (J4).

## 7. Pictures and push

- **Pictures.** `POST /lessons/media` stores the image in a private bucket and answers `{ id, url, alt }` with
  `url = https://api.teacheraid.education/api/v1/media/{id}`, where `id` is a random UUID. That route streams the file from
  Storage with a long cache time and needs no cookie, because a library template's pictures are shown to teachers who do not
  own them. This keeps the app's Content Security Policy as it is (images from itself and the API only). A URL on another host,
  a Supabase public bucket for example, needs a frontend change first: tell the owner (check section 5).
- **Push.** Generate a VAPID key pair. The public key goes to the owner for the frontend build; the private key stays in the
  service. `PUT /me/push-token` stores the browser's subscription and `DELETE` removes it. Send pushes where the spec
  asks for them with a library such as `web-push` (check 4.5).

## 8. Settings

Set in the service's environment and in the dashboards, never in code. Names only here:

| Where | What |
|---|---|
| Service | `SUPABASE_URL`, the Supabase secret (service-role) key, the publishable key if Supabase Auth runs the handshake, `DATABASE_URL` |
| Service | `APP_ORIGIN=https://app.teacheraid.education` (CORS and the redirect after sign-in, H3), `API_ORIGIN=https://api.teacheraid.education` |
| Service | The AI provider, model id, region, time limit and credentials (a service account or a role, not a personal key), and the AI spec's constants (`DRAFT_PENDING_MAX_SECONDS=180`, `AI_RETRY_COUNT=1`, ...) |
| Service | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` |
| Supabase dashboard | The project's region (EU), the Google and Azure providers, the redirect allow-list (section 3.1), private buckets, RLS on every table |
| Google and Microsoft consoles | The OAuth apps and their one callback (H2) |
| Vercel, the owner's part | A second project on `app.teacheraid.education` with `NEXT_PUBLIC_API_MODE=live`, `NEXT_PUBLIC_API_URL=https://api.teacheraid.education`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY` |

## 9. Order of work

1. **Audit.** Run `docs/backend-launch-check.md` against the backend as it is, and send the owner its report.
2. **Transport first** (T1 to T7): the service on `api.teacheraid.education`, the cookie, CORS, the error shape, the stream.
   Nothing else can be tested until these pass.
3. **Sign-in** (section 3), then the teacher's lessons and **drafts with the AI** (section 5, D1 to D5).
4. **Live lessons**: the console and class-view snapshots, the timer, join codes, the stream events (L, Q, E, J, 3.8).
5. **The student app's calls** (section 4 of the check), pictures and push.
6. **The curl checks** in section 8 of the check file, against the deployed service.
7. **The owner points a preview at the API**: sign in as a teacher, prepare a lesson from typed text, a PDF and a .docx,
   refine, save, run a lesson with two phones (one by QR, one by the typed code), end it, read the review.
8. **Send the owner the facts for the privacy page** (check section 6): the Supabase region, the AI provider, model and region,
   where files are stored, and every other service that receives personal data. Then the launch-day steps in
   `docs/launch-plan.md` (C).

Done means: every check in sections 2 to 4 of the launch check is `PASS`, step 7 works end to end on a laptop and an iPhone,
and the owner has the privacy facts.
