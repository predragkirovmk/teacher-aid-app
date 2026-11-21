# TeacherAid

One Next.js app with three surfaces:

- the website, at `/` (Macedonian) and `/en`;
- the student app, at `/app`, on phones in class;
- the teacher app, at `/teacher`, on a school laptop and a projector.

`CLAUDE.md` says which code and styles belong to which surface, and how the work is done and checked.

## Run

```bash
pnpm install
pnpm dev
```

Both apps run on a mock that lives in the browser unless the build sets `NEXT_PUBLIC_API_MODE=live` and
`NEXT_PUBLIC_API_URL`. `docs/launch-plan.md` describes the live build and where it is served.

The website's early-access form keeps its signups in Upstash Redis: set `UPSTASH_REDIS_REST_URL` and
`UPSTASH_REDIS_REST_TOKEN` (or the `KV_REST_API_*` pair the Vercel marketplace injects).

## Checks

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

## Stack

Next.js 16 (App Router), React 19, TypeScript, pnpm. The teacher app uses hand-written CSS, `@phosphor-icons/react`
and GSAP.

The old Startup Weekend demo (`/host`, `/j/…`, `/print`) was retired on 2026-11-20.
