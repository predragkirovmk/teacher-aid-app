/**
 * A tiny stand-in for the TeacherAid API, for the live-mode smoke test: just enough of spec 11.1
 * under /api/v1 for Home, Alerts and Profile to render from real HTTP. Run with Node 22.18+ (it
 * strips the types itself): `node tests/fake-api/server.mts`.
 *
 * Control endpoints for a test (not part of the API):
 *   GET  /__control/state          what the server holds, including the calls it received
 *   POST /__control/reset          back to the starting data
 *   POST /__control/signed-out     answer 401 to every call until reset
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type {
  WireAttendance,
  WireBadge,
  WireCourse,
  WireLeaderboard,
  WireNotification,
  WireResult,
  WireStudent,
} from "../../lib/app/api/wire";

const PORT = Number(process.env.FAKE_API_PORT ?? 3101);

/** An origin on this machine, which is the only kind a test browser sends. */
const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

const NOW = Date.now();
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();
const DAY = 86_400_000;

const subject = (id: string, name: string) => ({ id, name });
const COURSES: WireCourse[] = [
  { id: "c-math", subject: subject("math", "Mathematics"), teacher: { name: "J. Milev" }, class: { id: "cl-7b", name: "7B" } },
  { id: "c-eng", subject: subject("english", "English"), teacher: { name: "A. Stojanova" }, class: { id: "cl-7b", name: "7B" } },
  { id: "c-phys", subject: subject("physics", "Physics"), teacher: { name: "S. Petrov" }, class: { id: "cl-7b", name: "7B" } },
];

const initial = () => ({
  signedOut: false,
  student: {
    id: "st-1",
    full_name: "Live Student",
    school_email: "live.student@school.example",
    display_name: null,
    photo_url: null,
    school: { id: "sc-1", name: "Test School" },
    class: { id: "cl-7b", name: "7B" },
    settings: { notifications_on: true, locale: "en" },
  } as WireStudent,
  notifications: [
    {
      id: "n-1",
      kind: "result_ready",
      payload: { course_id: "c-math", subject_id: "math", subject_name: "Mathematics", session_id: "se-1", right: 4, total: 5 },
      created_at: iso(DAY),
      read_at: null,
    },
    {
      id: "n-2",
      kind: "marked_late",
      payload: { course_id: "c-phys", subject_id: "physics", subject_name: "Physics", date: iso(3 * DAY) },
      created_at: iso(3 * DAY),
      read_at: null,
    },
    {
      id: "n-3",
      kind: "generic",
      payload: { title: "Parents evening", body: "On Thursday at 18:00." },
      created_at: iso(5 * DAY),
      read_at: iso(4 * DAY),
    },
  ] as WireNotification[],
  /** Every request the server saw, as "METHOD path", for a test to look at. */
  calls: [] as string[],
  /** The last body of each write, by "METHOD path". */
  bodies: {} as Record<string, unknown>,
});

let state = initial();

const ATTENDANCE: WireAttendance = {
  attended: 18,
  total: 20,
  percent: 90,
  percent_week_ago: 88,
  log: [
    { id: "a-1", course_id: "c-math", subject: subject("math", "Mathematics"), date: iso(DAY), status: "present", joined_at: null },
    { id: "a-2", course_id: "c-phys", subject: subject("physics", "Physics"), date: iso(3 * DAY), status: "late", joined_at: null },
  ],
};

const RESULTS: WireResult[] = [
  {
    session_id: "se-1",
    course_id: "c-math",
    subject: subject("math", "Mathematics"),
    lesson_title: "Linear equations",
    ended_at: iso(DAY),
    right: 4,
    total: 5,
    questions: [
      { id: "q-1", prompt: "2x = 10, x = ?", correct: true, correct_answer: "5", your_answer: "5" },
      { id: "q-2", prompt: "3x + 1 = 10, x = ?", correct: false, correct_answer: "3", your_answer: "4" },
    ],
  },
];

const LEADERBOARD = (): WireLeaderboard => ({
  scope: "class",
  season: null,
  rows: [
    { student_id: "st-9", name: "Ana G.", points: 140, rank: 1, is_me: false },
    { student_id: "st-8", name: "Luka S.", points: 120, rank: 2, is_me: false },
    { student_id: "st-1", name: state.student.display_name ?? state.student.full_name, points: 95, rank: 3, is_me: true },
    { student_id: "st-7", name: "Mila J.", points: 80, rank: 4, is_me: false },
  ],
});

const BADGES: WireBadge[] = [
  { code: "answer", title: "First answer", points: 20, earned: true, awarded_at: iso(2 * DAY) },
  { code: "ontime", title: "On time", points: 20, earned: false, awarded_at: null },
  { code: "perfect", title: "Perfect quiz", points: 20, earned: false, awarded_at: null },
];

function send(res: ServerResponse, status: number, body?: unknown) {
  if (body === undefined) {
    res.writeHead(status).end();
    return;
  }
  res.writeHead(status, { "Content-Type": "application/json" }).end(JSON.stringify(body));
}

const fail = (res: ServerResponse, status: number, code: string) => send(res, status, { error: { code, message: code } });

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const text = Buffer.concat(chunks).toString("utf8");
  try {
    return text ? JSON.parse(text) : undefined;
  } catch {
    return undefined;
  }
}

async function route(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? "/", "http://fake");
  const path = url.pathname;
  const method = req.method ?? "GET";

  if (path === "/__control/state") return send(res, 200, state);
  if (path === "/__control/reset" && method === "POST") {
    state = initial();
    return send(res, 204);
  }
  if (path === "/__control/signed-out" && method === "POST") {
    state.signedOut = true;
    return send(res, 204);
  }

  if (!path.startsWith("/api/v1/")) return fail(res, 404, "not_found");
  const api = path.slice("/api/v1".length);
  state.calls.push(`${method} ${api}`);

  if (state.signedOut) return fail(res, 401, "unauthenticated");

  if (method === "GET") {
    if (api === "/me") return send(res, 200, state.student);
    if (api === "/me/courses") return send(res, 200, COURSES);
    if (api === "/me/attendance") return send(res, 200, ATTENDANCE);
    if (api === "/me/results") return send(res, 200, RESULTS);
    if (api === "/me/topics") return send(res, 200, []);
    if (api === "/me/leaderboard") return send(res, 200, LEADERBOARD());
    if (api === "/me/badges") return send(res, 200, BADGES);
    if (api === "/me/notifications") return send(res, 200, [...state.notifications].sort((a, b) => b.created_at.localeCompare(a.created_at)));
    if (api === "/me/practice-sets") return send(res, 200, []);
  }

  if (method === "POST" && api === "/me/notifications/read") {
    const body = (await readJson(req)) as { all?: boolean; ids?: string[] } | undefined;
    state.bodies[`${method} ${api}`] = body;
    for (const n of state.notifications) {
      if (n.read_at === null && (body?.all || body?.ids?.includes(n.id))) n.read_at = new Date().toISOString();
    }
    return send(res, 204);
  }

  if (method === "PATCH" && api === "/me/profile") {
    const body = (await readJson(req)) as { display_name?: string | null } | undefined;
    state.bodies[`${method} ${api}`] = body;
    const name = body?.display_name;
    if (typeof name === "string" && (name.length < 2 || name.length > 24)) return fail(res, 422, "validation_failed");
    if (name !== undefined) state.student.display_name = name;
    return send(res, 200, state.student);
  }

  if (method === "PATCH" && api === "/me/settings") {
    const body = (await readJson(req)) as { notifications_on?: boolean; locale?: "mk" | "en" } | undefined;
    state.bodies[`${method} ${api}`] = body;
    if (body?.notifications_on !== undefined) state.student.settings.notifications_on = body.notifications_on;
    if (body?.locale !== undefined) state.student.settings.locale = body.locale;
    return send(res, 200, state.student);
  }

  if (method === "POST" && api === "/auth/logout") {
    state.signedOut = true;
    return send(res, 204);
  }

  if (method === "POST" && api === "/sessions/join") return fail(res, 410, "token_expired");

  return fail(res, 404, "not_found");
}

createServer((req, res) => {
  // The app and the API are on different ports, so the browser asks first and sends its cookies.
  const origin = req.headers.origin;
  if (origin && LOCAL_ORIGIN.test(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, PUT, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept");
    res.setHeader("Vary", "Origin");
  }
  if (req.method === "OPTIONS") {
    res.writeHead(204).end();
    return;
  }
  route(req, res).catch((e) => {
    console.error(e);
    fail(res, 500, "server_error");
  });
}).listen(PORT, "127.0.0.1", () => console.log(`fake API on http://127.0.0.1:${PORT}/api/v1`));
