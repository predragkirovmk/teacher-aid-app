# TeacherAid student app: v1 build plan (backend not ready yet)

Started 2026-10-20. The `/app` student PWA stops being a demo and becomes the real product. The
backend is not built yet, so every step is written against the API contract and runs on a mock
adapter; when the API exists, switching `NEXT_PUBLIC_API_MODE` from `mock` to `live` is the swap.

Source of truth for behaviour and data: the backend spec
`~/Desktop/teacher-aid-brain/Areas/product/backend-handoff/backend-spec-for-agents.md`
(sections 3, 4.4, 6, 7, 8, 9, 10, 11, 12). Where the demo and the spec disagree, the spec wins,
except for demo-only content kept by owner decision (timetable, next-lesson card, scheduled quiz,
streak badge, class 7B): keep it, but show it only in mock mode behind one `demoOnly` flag.

## Steps (one branch `app-v1`, one preview link per step)

1. Data layer: typed API contract (spec 3 and 11), mock adapter over the current store, hooks
   for screens, error codes mapped to MK/EN copy, `demoOnly` flag. No visible change.
2. Quality net: Vitest for pure logic, Playwright smoke tests of the core flows in mock mode,
   GitHub Actions CI (lint, typecheck, build, tests), error reporting hook (off without a DSN).
3. Sign-in (F-02, FR-AUTH-04..06): school email sign-in screen, unknown email (EC-AUTH-02),
   signed in elsewhere (BR-AUTH-03), sign-out, `next=` continuation of a QR join.
4. Join and live session engine (F-07, 4.4, 11.2): join by token, error states (token_expired,
   not_enrolled, session_ended), student-state snapshot on reconnect, server clock sync, a
   realtime abstraction with a mock session driver; quiz play renders from session state.
5. Offline answers (F-08, BR-NET-01): IndexedDB outbox with idempotency keys and server-clock
   answer times, retry on reconnect, connection states in the UI.
6. Question kinds: numeric, opener vote and reason (debate claim included), per spec 7.6-7.7.
7. Anonymous question (F-09, BR-ANON-02) and the web focus flag (7.10, pilot decision).
8. Practice sets and results history (F-12, US-S07, US-S08, /me/results, /me/topics).
9. Notifications and push client (7.14, US-S10): feed from the API, permission prompt, service
   worker push handler, `PUT /me/push-token`, settings switch.
10. Privacy and consent: in-app privacy notice, first-sign-in consent, "your data" screen, terms;
    ZZLP / GDPR, minors.
11. Final gate: accessibility, design and motion review of everything new, text hygiene, code
    review.

Teacher console and class view (the live lesson end to end) are the next phase, not this plan.

## Rules every step follows

- Work only in `/Users/pedza/Desktop/teacher-aid-app-v1` on branch `app-v1`. Never touch
  `~/Desktop/teacher-aid-app` (main) or other worktrees. Do not push.
- Read `AGENTS.md`: this Next.js (16.3) differs from training data; read the relevant guide in
  `node_modules/next/dist/docs/` before writing Next code.
- Design system v2 (blue and yellow): `.impeccable.md` and `app/(app)/app.css` tokens. One yellow
  control per screen, yellow never small text on blue, right/wrong never by colour alone,
  Phosphor icons (regular, `XxxIcon`), 8pt grid, Golos Text for titles and numbers, system font
  for body, Macedonian first (ti form), English second, every string in `lib/app/i18n.ts`.
  Motion only where something changed, spring tokens from app.css, Reduce Motion respected.
- Match surrounding code style and comment density. No backwards-compatibility shims.
- Small focused commits; end each message with
  `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Before finishing: `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm build` (and the tests once
  step 2 exists) must pass.
- Preview: from the worktree run `vercel deploy --yes` (project already linked in `.vercel/`),
  from a clean tree (everything committed). Verify the change on the https preview with the
  built-in browser or headless Chrome (a prod build over http://localhost is unstyled because of
  the CSP). Return the preview URL ending in `/app` plus the most relevant deep link.
- Backend handoff: if a step changes what the API must provide (new field, endpoint, event, rule,
  state), update both `backend-spec-for-agents.md` and `backend-guide-for-developer.md` in
  `~/Desktop/teacher-aid-brain/Areas/product/backend-handoff/` (bump version, changelog row,
  label new things PROPOSED), following `~/Desktop/teacher-aid-brain/CLAUDE.md`. Do not commit
  or push the brain; report what changed.
- Ask nothing; where a product decision is open (an OPEN-xx item), pick the spec's suggested
  default or the most reversible option, and list it under "Decisions taken" in the report.

## Report format (final message)

Preview URL, deep link, commits (hash and subject), decisions taken, handoff doc changes, what
was verified and how, anything left undone.
