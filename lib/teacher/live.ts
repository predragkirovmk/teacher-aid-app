import type {
  ChannelEvent,
  ClassViewSnapshot,
  ConsoleQuestion,
  ConsoleSnapshot,
  ConsoleStudent,
  FocusFlag,
  NoDeviceReason,
  QuestionStatus,
  SessionState,
} from "./api/types";

/**
 * The rules of a live lesson that need no browser: where the lesson stands, how a student is shown and in what order, how many have
 * joined, the reasons for a student without a phone, when the join token changes, whether the projected window is still open, and how
 * the realtime events change what a screen holds. All of it is unit tested.
 */

// ---- Where the lesson stands -----------------------------------------------------------------------

/** The four states of a session, in order (4.1). The lesson only moves forward. */
export const STATES: readonly SessionState[] = ["lobby", "teaching", "review", "ended"];

export type StateStep = { state: SessionState; position: "done" | "current" | "next" };

/** The line of four states, each marked as one that is past, the one the lesson is in, or one still to come. */
export function stateSteps(current: SessionState): StateStep[] {
  const at = STATES.indexOf(current);
  return STATES.map((state, i) => ({ state, position: i < at ? "done" : i === at ? "current" : "next" }));
}

/** How far along a state is: events and moves only ever go forward (4.1). */
export const stateRank = (state: SessionState): number => STATES.indexOf(state);

/** The state a lesson is moved to from `state`, or null when there is none to move to: forward, one at a time, and End is not a move (4.1). */
export const nextState = (state: SessionState): "teaching" | "review" | null => (state === "lobby" ? "teaching" : state === "teaching" ? "review" : null);

// ---- The students ------------------------------------------------------------------------------------

/**
 * How one student is shown, in one word: not here yet, here, here after the lesson began, here but the connection is lost, or marked
 * present without a phone. The teacher sees these as an icon and a word, never colour alone.
 */
export type StudentState = "not_yet" | "joined" | "late" | "offline" | "no_device";

export function studentState(s: Pick<ConsoleStudent, "attendance" | "online">): StudentState {
  if (s.attendance === "present_no_device") return "no_device";
  if (s.attendance === null || s.attendance === "absent") return "not_yet";
  if (!s.online) return "offline";
  return s.attendance === "late" ? "late" : "joined";
}

/** Whether the student came in with a phone, which is what "joined" counts (a mark the teacher wrote is not a join, BR-ATT-01). */
export const hasJoined = (s: Pick<ConsoleStudent, "attendance">): boolean => s.attendance === "present" || s.attendance === "late";

/** "12 of 26": how many of the class have joined with a phone, and how many marked present without one. */
export function joinedCount(students: readonly Pick<ConsoleStudent, "attendance">[]): { joined: number; withoutPhone: number; total: number } {
  return {
    joined: students.filter(hasJoined).length,
    withoutPhone: students.filter((s) => s.attendance === "present_no_device").length,
    total: students.length,
  };
}

/** How many of the class are still not here and not marked: the ones the teacher is waiting for. */
export const missingCount = (students: readonly Pick<ConsoleStudent, "attendance" | "online">[]): number =>
  students.filter((s) => studentState(s) === "not_yet").length;

export type RosterSection = "missing" | "here";

/**
 * The class in two calm groups: those who are not here yet, then those who are (or are marked). A student moves between the groups only
 * when something changes about them, and inside a group the order is the register's, as the API sends it, so nothing shuffles. In the
 * group of those who are here, a student whose connection is lost comes first: that one is worth a look.
 */
export function rosterSections<T extends Pick<ConsoleStudent, "attendance" | "online">>(students: readonly T[]): Record<RosterSection, T[]> {
  const missing = students.filter((s) => studentState(s) === "not_yet");
  const here = students.filter((s) => studentState(s) !== "not_yet");
  return { missing, here: [...here.filter((s) => studentState(s) === "offline"), ...here.filter((s) => studentState(s) !== "offline")] };
}

// ---- Present without a phone (F-11, FR-ATT-04, BR-ATT-01) --------------------------------------------

/** The four reasons, in the order they are offered (3.2). */
export const NO_DEVICE_REASONS: readonly NoDeviceReason[] = ["no_phone", "battery", "no_data", "no_focus_authorization"];

/** Whether a student may be marked present without a phone: only one who has not joined with one (a join stands, and a mark never overrides it). */
export const canMarkNoDevice = (s: Pick<ConsoleStudent, "attendance">): boolean => !hasJoined(s);

// ---- The join token and the code ---------------------------------------------------------------------

/** The token and the short code change every 30 seconds (BR-JOIN-02, FR-JOIN-03). */
export const TOKEN_ROTATE_MS = 30_000;

/** How far this computer's clock is from the server's, from a snapshot's `server_now` and the moment it arrived. Add it to `Date.now()`. */
export const serverOffset = (serverNow: string, receivedAt: number): number => Date.parse(serverNow) - receivedAt;

/** How long until `validTo`, on the server's clock as this computer carries it on. Not below zero. */
export const msUntil = (validTo: string, offset: number, now: number): number => Math.max(0, Date.parse(validTo) - (now + offset));

/**
 * A token whose time is up by more than a moment, and nothing has replaced it: the event was missed, so the snapshot is read again.
 * The grace is for the event that is on its way (it comes within a second or two of the change).
 */
export const TOKEN_GRACE_MS = 4000;
export const tokenIsStale = (validTo: string, offset: number, now: number): boolean => now + offset > Date.parse(validTo) + TOKEN_GRACE_MS;

/** The address in the QR: the student app on this app's own origin, with the token (FR-JOIN-02; the path shape is the student app's). */
export const joinUrl = (origin: string, token: string): string => `${origin.replace(/\/+$/, "")}/app/checkin/${encodeURIComponent(token)}`;

/**
 * The code in groups of three, so that it is easy to read out and to copy with the eye: "483 920". A code of another length is shown
 * in groups of three from the left too.
 */
export const formatShortCode = (code: string): string => (code.match(/.{1,3}/g) ?? []).join(" ");

/**
 * The student app does not let a student type the code (OPEN-03, 2026-10-13): a student scans it, with the app or the phone's own camera.
 * So neither screen shows the code, and the line on the projector says to scan; both show it, with "or enter the code", only when the
 * student app brings typing back. One switch: change it here to turn it on. A build made with `NEXT_PUBLIC_STUDENTS_CAN_TYPE_CODE=1` turns it
 * on too, which is how `tests/e2e/live-code.spec.ts` runs.
 */
export const STUDENTS_CAN_TYPE_CODE = process.env.NEXT_PUBLIC_STUDENTS_CAN_TYPE_CODE === "1";

// ---- The projected window ----------------------------------------------------------------------------

/** The class view tells the console it is open every 2 seconds; the console counts it closed after three missed beats. */
export const HEARTBEAT_MS = 2000;
export const HEARTBEAT_STALE_MS = 3 * HEARTBEAT_MS;
/** A console that has just opened waits this long for the first beat before it says the window is closed. */
export const HEARTBEAT_GRACE_MS = 2500;

export type ClassViewStatus = "checking" | "open" | "closed" | "never" | "unknown";

/**
 * Whether the projected window is open, from the last beat the console heard (null if none), when it began listening, and whether the window
 * was ever open for this lesson (`wasOpen`: a beat was heard before, here or before a reload). A window that went quiet for longer than
 * `HEARTBEAT_STALE_MS` is closed. One that has never been opened is not "closed": nothing is said of it, and the button is the plain one.
 * One that was open before a reload is "checking" for a moment, then closed if no beat comes. `supported` is false in a browser with no
 * BroadcastChannel, where nothing can be known and nothing is claimed.
 */
export function classViewStatus(lastBeat: number | null, listeningSince: number, now: number, { supported = true, wasOpen = false } = {}): ClassViewStatus {
  if (!supported) return "unknown";
  if (lastBeat !== null) return now - lastBeat <= HEARTBEAT_STALE_MS ? "open" : "closed";
  if (!wasOpen) return "never";
  return now - listeningSince < HEARTBEAT_GRACE_MS ? "checking" : "closed";
}

/** The name of the channel the two windows of one lesson talk on. */
export const windowChannelName = (sessionId: string): string => `teacheraid-live-${sessionId}`;

/** What the two windows say to each other. */
export type WindowMessage = { kind: "hello" } | { kind: "beat" } | { kind: "closing" };
export const isWindowMessage = (v: unknown): v is WindowMessage =>
  !!v && typeof v === "object" && ["hello", "beat", "closing"].includes((v as { kind?: unknown }).kind as string);

/** The window name that brings back the same window on a second press, and the features that make it a window of its own and not a tab. */
export const CLASS_WINDOW_NAME = "teacheraid-class-view";
export const CLASS_WINDOW_FEATURES = "popup=yes,width=1280,height=720,left=80,top=60";

export type ClassWindow = { focus(): void; closed?: boolean };
export type OpenWindow = (url: string, name: string, features?: string) => ClassWindow | null;

/**
 * Open the projected window, or say that a popup blocker stopped it. A window this page opened and that is still open is brought forward
 * and not loaded again; the fixed name does the same for one opened by an earlier load of the console (the browser finds it by name).
 */
export function openClassWindow(open: OpenWindow, url: string, existing: ClassWindow | null): { result: "opened" | "focused" | "blocked"; window: ClassWindow | null } {
  if (existing && !existing.closed) {
    existing.focus();
    return { result: "focused", window: existing };
  }
  const opened = open(url, CLASS_WINDOW_NAME, CLASS_WINDOW_FEATURES);
  if (!opened) return { result: "blocked", window: null };
  opened.focus();
  return { result: "opened", window: opened };
}

// ---- Realtime: what an event does to what a screen holds ----------------------------------------------

const stamped = (e: ChannelEvent) => Date.parse(e.server_now);

/** The names of the last five to join, newest first (the `recent` of `joined.count`). */
export const RECENT_NAMES = 5;
export function recentNames(students: readonly Pick<ConsoleStudent, "full_name" | "attendance" | "joined_at">[]): string[] {
  return students
    .filter((s) => hasJoined(s) && s.joined_at !== null)
    .sort((a, b) => Date.parse(b.joined_at as string) - Date.parse(a.joined_at as string))
    .slice(0, RECENT_NAMES)
    .map((s) => s.full_name);
}

const questionRank = (status: QuestionStatus): number => ["ready", "open", "closed", "revealed"].indexOf(status);

/** A console question after a lifecycle event: a status only moves forward (4.2), so an event that repeats or comes late changes nothing. */
function moveQuestion(q: ConsoleQuestion, event: ChannelEvent): ConsoleQuestion {
  if (q.status === "skipped") return q;
  switch (event.type) {
    case "question.opened":
      return q.status === "ready" ? { ...q, status: "open", fired_at: event.question.fired_at, closes_at: event.question.closes_at, answered: 0 } : q;
    case "question.closed":
      return questionRank(q.status) < questionRank("closed") ? { ...q, status: "closed", closed_at: event.server_now } : q;
    case "question.revealed":
      return q.status !== "revealed" ? { ...q, status: "revealed", revealed_at: event.server_now, counts: event.counts, closed_at: q.closed_at ?? event.server_now } : q;
    case "question.skipped":
      return { ...q, status: "skipped", skipped_at: event.server_now };
    case "question.progress":
      return { ...q, answered: event.answered, joined: event.joined };
    default:
      return q;
  }
}

/**
 * Whether the console must read its snapshot again for an event: a question it does not know has been sent (a quick question made in another
 * window carries its answer, which the event does not).
 */
export const consoleNeedsRead = (snapshot: ConsoleSnapshot, event: ChannelEvent): boolean =>
  event.type === "question.opened" && !snapshot.questions.some((q) => q.id === event.question.id);

/**
 * The console after an event. An event stamped before the snapshot the screen holds is dropped, and a state only moves forward, so
 * events may repeat or come in any order (11.2). What a screen does not show is left alone.
 */
export function applyConsoleEvent(snapshot: ConsoleSnapshot, event: ChannelEvent): ConsoleSnapshot {
  if (stamped(event) < Date.parse(snapshot.server_now)) return snapshot;
  switch (event.type) {
    case "state.changed":
      return stateRank(event.state) > stateRank(snapshot.session.state) ? { ...snapshot, session: { ...snapshot.session, state: event.state } } : snapshot;
    case "join_token.rotated":
      return { ...snapshot, join: { token: event.token, short_code: event.short_code, valid_to: event.valid_to } };
    case "student.joined":
      return { ...snapshot, students: snapshot.students.map((s) => (s.id === event.student.id ? event.student : s)) };
    case "student.presence":
      return { ...snapshot, students: snapshot.students.map((s) => (s.id === event.student_id ? { ...s, online: event.online } : s)) };
    case "student.answer_state":
      return { ...snapshot, students: snapshot.students.map((s) => (s.id === event.student_id ? { ...s, answer_state: event.state } : s)) };
    case "question.opened":
    case "question.closed":
    case "question.revealed":
    case "question.skipped":
    case "question.progress": {
      const id = event.type === "question.opened" ? event.question.id : event.type === "question.progress" ? event.session_question_id : event.session_question_id;
      const questions = snapshot.questions.map((q) => (q.id === id ? moveQuestion(q, event) : q));
      const changed = questions.some((q, i) => q !== snapshot.questions[i]);
      // Only the question that is open holds the "answered" marks: skipping or revealing another one leaves them alone.
      const closing =
        (event.type === "question.closed" || event.type === "question.skipped" || event.type === "question.revealed") &&
        snapshot.questions.some((q) => q.id === id && q.status === "open");
      const students = closing ? snapshot.students.map((s) => (s.answer_state === null ? s : { ...s, answer_state: null })) : snapshot.students;
      // A question sent clears the nudge: the line is only for a lesson that has gone quiet.
      const nudge = event.type === "question.opened" ? null : snapshot.nudge;
      return changed || nudge !== snapshot.nudge ? { ...snapshot, questions, students, nudge } : snapshot;
    }
    case "leaderboard.updated": {
      const points = new Map(event.rows.map((r) => [r.student_id, r.points]));
      return { ...snapshot, board: event.rows, students: snapshot.students.map((s) => ({ ...s, points: points.get(s.id) ?? s.points })) };
    }
    case "anon_question.received":
      return snapshot.anon_questions.some((a) => a.id === event.question.id) ? snapshot : { ...snapshot, anon_questions: [...snapshot.anon_questions, event.question] };
    case "focus.flag": {
      const f = event.flag;
      const same = (x: FocusFlag) => x.student_id === f.student_id && x.session_question_id === f.session_question_id && x.lost_at === f.lost_at;
      const flags = snapshot.focus_flags.some(same) ? snapshot.focus_flags.map((x) => (same(x) ? f : x)) : [...snapshot.focus_flags, f];
      return { ...snapshot, focus_flags: flags, students: snapshot.students.map((s) => (s.id === f.student_id ? { ...s, focus_flags: flags.filter((x) => x.student_id === s.id).length } : s)) };
    }
    case "nudge":
      return { ...snapshot, nudge: { idle_seconds: event.idle_seconds } };
    default:
      return snapshot;
  }
}

/** The class view after an event: the same rules, and only what the projector shows. */
export function applyClassEvent(snapshot: ClassViewSnapshot, event: ChannelEvent): ClassViewSnapshot {
  if (stamped(event) < Date.parse(snapshot.server_now)) return snapshot;
  const asked = snapshot.question;
  switch (event.type) {
    case "state.changed":
      // The lesson ended: the projector keeps nothing of it (no ranking, no review, no code) beyond the words that it is over.
      if (event.state === "ended" && snapshot.session.state !== "ended") {
        return { ...snapshot, session: { ...snapshot.session, state: "ended", recent: [] }, join: null, question: null, progress: null, reveal: null, skipped: false, board: [], review: null };
      }
      return stateRank(event.state) > stateRank(snapshot.session.state) ? { ...snapshot, session: { ...snapshot.session, state: event.state } } : snapshot;
    case "review.ready":
      return { ...snapshot, review: { most_missed: event.most_missed, anon_questions: event.anon_questions } };
    case "join_token.rotated":
      return { ...snapshot, join: { token: event.token, short_code: event.short_code, valid_to: event.valid_to } };
    case "joined.count":
      return { ...snapshot, session: { ...snapshot.session, joined_count: event.joined_count, recent: event.recent ?? snapshot.session.recent } };
    case "question.opened":
      return { ...snapshot, question: event.question, progress: { answered: 0, joined: snapshot.session.joined_count }, reveal: null, skipped: false };
    case "question.progress":
      return asked && asked.id === event.session_question_id ? { ...snapshot, progress: { answered: event.answered, joined: event.joined } } : snapshot;
    case "question.closed":
      return asked && asked.id === event.session_question_id && questionRank(asked.status) < questionRank("closed") ? { ...snapshot, question: { ...asked, status: "closed" } } : snapshot;
    case "question.revealed":
      return asked && asked.id === event.session_question_id
        ? {
            ...snapshot,
            question: { ...asked, status: "revealed" },
            reveal: { session_question_id: event.session_question_id, correct_answer: event.correct_answer, explanation: event.explanation, counts: event.counts },
          }
        : snapshot;
    case "question.skipped":
      return asked && asked.id === event.session_question_id ? { ...snapshot, question: { ...asked, status: "skipped" }, skipped: true } : snapshot;
    case "leaderboard.updated":
      return { ...snapshot, board: event.rows };
    default:
      return snapshot;
  }
}
