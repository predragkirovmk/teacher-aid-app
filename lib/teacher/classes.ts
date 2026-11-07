import { sortAttendance } from "./attendance";
import type {
  CourseDashboard,
  CourseSummary,
  DashboardAnonQuestion,
  DashboardPractice,
  DashboardSession,
  DashboardTopic,
  Id,
  NoDeviceReason,
} from "./api/types";

/**
 * The numbers of the class results (FR-DASH-01), worked out from `GET /courses/{id}/dashboard` and nothing else, so the page and the tests read the
 * same figures. Pure. Every list here is in the order the page shows it.
 */

/** A list longer than this shows its first rows and "Прикажи ги сите (N)". Five: ten rows of one list is a screen of the page and more. */
export const SHOW_FIRST = 5;

const collator = new Intl.Collator("mk", { sensitivity: "base", numeric: true });

/** Whole percent of a share from 0 to 1. */
export const percent = (share: number): number => Math.round(share * 100);

// ---- The list of classes ----------------------------------------------------------------------------

/** The most recently taught first, then the ones not taught yet by class name. */
export function orderCourses(courses: readonly CourseSummary[]): CourseSummary[] {
  const taught = courses.filter((c) => c.last_session_at !== null);
  const rest = courses.filter((c) => c.last_session_at === null);
  const byName = (a: CourseSummary, b: CourseSummary) => collator.compare(a.class.name, b.class.name) || collator.compare(a.subject.name, b.subject.name);
  taught.sort((a, b) => Date.parse(b.last_session_at as string) - Date.parse(a.last_session_at as string) || byName(a, b));
  return [...taught, ...rest.sort(byName)];
}

// ---- Attendance -------------------------------------------------------------------------------------

export type StudentAttendance = {
  student_id: Id;
  full_name: string;
  joined_mid_year: boolean;
  joined_class_at: string | null;
  /** The lessons the student was enrolled for (a student who joined later has none before that day). */
  held: number;
  present: number;
  late: number;
  absent: number;
  no_device: number;
  /** Why the lessons without a phone were without one (FR-DASH-03). Only reasons that were given. */
  reasons: Partial<Record<NoDeviceReason, number>>;
};

/** One line per student, in the register's order, from the attendance rows of the lessons listed. A student with no row at all has `held` 0. */
export function attendanceByStudent(d: Pick<CourseDashboard, "students" | "sessions" | "attendance">): StudentAttendance[] {
  const listed = new Set(d.sessions.map((s) => s.id));
  const rows = new Map<Id, StudentAttendance>(
    d.students.map((s) => [
      s.id,
      {
        student_id: s.id,
        full_name: s.full_name,
        joined_mid_year: s.joined_mid_year,
        joined_class_at: s.joined_class_at,
        held: 0,
        present: 0,
        late: 0,
        absent: 0,
        no_device: 0,
        reasons: {},
      },
    ]),
  );
  for (const a of d.attendance) {
    const row = rows.get(a.student_id);
    if (!row || !listed.has(a.session_id)) continue;
    row.held++;
    if (a.status === "present") row.present++;
    else if (a.status === "late") row.late++;
    else if (a.status === "absent") row.absent++;
    else {
      row.no_device++;
      if (a.no_device_reason) row.reasons[a.no_device_reason] = (row.reasons[a.no_device_reason] ?? 0) + 1;
    }
  }
  return sortAttendance([...rows.values()]);
}

// ---- The summary at the top -------------------------------------------------------------------------

/** Right out of total, 0 to 1; a topic nobody was asked has no share. */
export const topicShare = (t: Pick<DashboardTopic, "right" | "total">): number | null => (t.total > 0 ? t.right / t.total : null);

/** The topics that were asked, weakest first: the smaller share, then the one asked more often, then by name. */
export function weakestFirst(topics: readonly DashboardTopic[]): DashboardTopic[] {
  return topics
    .filter((t) => t.total > 0)
    .sort((a, b) => (topicShare(a) as number) - (topicShare(b) as number) || b.total - a.total || collator.compare(a.topic, b.topic));
}

/** The share of students who were in the room (present, late, or present without a phone) over all the lessons, 0 to 1; null before any lesson. */
export function averageAttendance(d: Pick<CourseDashboard, "sessions" | "attendance">): number | null {
  const listed = new Set(d.sessions.map((s) => s.id));
  const rows = d.attendance.filter((a) => listed.has(a.session_id));
  if (rows.length === 0) return null;
  return rows.filter((a) => a.status !== "absent").length / rows.length;
}

/** The share of all the answers the class was asked for that were right, 0 to 1; null before any question was answered. */
export function averageRight(d: Pick<CourseDashboard, "topics">): number | null {
  const total = d.topics.reduce((n, t) => n + t.total, 0);
  return total > 0 ? d.topics.reduce((n, t) => n + t.right, 0) / total : null;
}

export type Summary = { lessons: number; attendance: number | null; right: number | null; weakest: DashboardTopic | null };

export function summaryOf(d: CourseDashboard): Summary {
  return { lessons: d.sessions.length, attendance: averageAttendance(d), right: averageRight(d), weakest: weakestFirst(d.topics)[0] ?? null };
}

// ---- Lessons over time ------------------------------------------------------------------------------

export type LessonRow = {
  session: DashboardSession;
  /** Students who were there with a phone: they took part. */
  took_part: number;
  enrolled: number;
  /** Whole percent of the answers given that were right. */
  right: number;
};

/** The lessons held, newest first as the API sends them. */
export function lessonRows(sessions: readonly DashboardSession[]): LessonRow[] {
  return sessions.map((session) => ({
    session,
    took_part: session.tally.present + session.tally.late,
    enrolled: session.tally.total,
    right: percent(session.right_rate),
  }));
}

// ---- Focus ------------------------------------------------------------------------------------------

export type StudentFocus = { student_id: Id; full_name: string; times: number; lessons: number; away_seconds: number };

/** Per student, how many times they left the app during a question. Only students who did; most first, then the register's order. */
export function focusByStudent(d: Pick<CourseDashboard, "students" | "focus_flags" | "sessions">): StudentFocus[] {
  const listed = new Set(d.sessions.map((s) => s.id));
  const names = new Map(d.students.map((s) => [s.id, s.full_name]));
  const by = new Map<Id, { times: number; lessons: Set<Id>; away: number }>();
  for (const f of d.focus_flags) {
    if (!listed.has(f.session_id) || !names.has(f.student_id)) continue;
    const row = by.get(f.student_id) ?? { times: 0, lessons: new Set<Id>(), away: 0 };
    row.times++;
    row.lessons.add(f.session_id);
    row.away += f.away_seconds ?? 0;
    by.set(f.student_id, row);
  }
  const rows = [...by].map(([student_id, v]) => ({ student_id, full_name: names.get(student_id) ?? "", times: v.times, lessons: v.lessons.size, away_seconds: v.away }));
  const register = new Map(sortAttendance(rows).map((r, i) => [r.student_id, i]));
  return rows.sort((a, b) => b.times - a.times || (register.get(a.student_id) as number) - (register.get(b.student_id) as number));
}

// ---- Questions to the teacher, practice -------------------------------------------------------------

/** Newest first. */
export function newestQuestions(list: readonly DashboardAnonQuestion[]): DashboardAnonQuestion[] {
  return [...list].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
}

export type PracticeRow = { practice: DashboardPractice; session: DashboardSession | null };

/** The practice sets, newest lesson first. */
export function practiceRows(d: Pick<CourseDashboard, "practice" | "sessions">): PracticeRow[] {
  const order = new Map(d.sessions.map((s, i) => [s.id, i]));
  return [...d.practice]
    .sort((a, b) => (order.get(a.practice_set.session_id) ?? Infinity) - (order.get(b.practice_set.session_id) ?? Infinity))
    .map((practice) => ({ practice, session: d.sessions.find((s) => s.id === practice.practice_set.session_id) ?? null }));
}

/** How many of the lessons held have no practice set. */
export const lessonsWithoutPractice = (d: Pick<CourseDashboard, "practice" | "sessions">): number => {
  const sets = new Set(d.practice.map((p) => p.practice_set.session_id));
  return d.sessions.filter((s) => !sets.has(s.id)).length;
};
