import { rankRows, scoreAnswer, selectPracticeQuestions } from "../scoring";
import type { SchoolType } from "../store";
import { bankLesson, bankQuestions } from "./mock-bank";
import type {
  AttendanceStatus,
  AuthProvider,
  NoDeviceReason,
  Question,
  SchoolKind,
  Subject,
} from "./types";

/**
 * The demo schools the mock adapter plays, and their history. Everything is invented: the teacher
 * Марија Петровска, her colleagues, a secondary school and a faculty that do not exist, and the
 * students. The history (a few finished lessons per class, with attendance, answers and points) is
 * worked out from a seed, so it is the same every time for the same day, and the points come from
 * the scoring rules of spec 8 (scoring.ts), so a class's numbers add up.
 */

export const DAY_MS = 86_400_000;

// ---- A small seeded random source, so the demo's history is stable ----------------------------

/** FNV-1a: a string to a 32-bit seed. */
export function hashSeed(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32: a random number in [0, 1) each call. */
export function rng(seed: string): () => number {
  let a = hashSeed(seed);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Random = () => number;
const pick = <T>(r: Random, items: readonly T[]): T => items[Math.floor(r() * items.length)];
const between = (r: Random, low: number, high: number) => low + r() * (high - low);

// ---- Names ----------------------------------------------------------------------------------

const MALE = [
  "Александар", "Стефан", "Давид", "Никола", "Филип", "Марко", "Борис", "Матеја", "Андреј", "Дарио", "Лука", "Виктор",
  "Теодор", "Игор", "Јован", "Мартин", "Петар", "Дамјан", "Христијан", "Тони", "Бојан", "Иван", "Кристијан", "Душан",
];
const FEMALE = [
  "Ана", "Марија", "Јована", "Теодора", "Софија", "Елена", "Миа", "Сара", "Ема", "Мартина", "Ивана", "Викторија",
  "Дејана", "Анастасија", "Катерина", "Тамара", "Христина", "Моника", "Наталија", "Дарија", "Лидија", "Симона", "Ленче", "Мила",
];
/** Surnames as [masculine, feminine]. */
const SURNAMES: [string, string][] = [
  ["Николовски", "Николовска"], ["Стојановски", "Стојановска"], ["Трајковски", "Трајковска"], ["Илиевски", "Илиевска"],
  ["Ристовски", "Ристовска"], ["Јованов", "Јованова"], ["Димитриевски", "Димитриевска"], ["Георгиевски", "Георгиевска"],
  ["Ангелов", "Ангелова"], ["Костов", "Костова"], ["Митев", "Митева"], ["Талевски", "Талевска"],
  ["Велковски", "Велковска"], ["Спасовски", "Спасовска"], ["Атанасовски", "Атанасовска"], ["Поповски", "Поповска"],
  ["Здравковски", "Здравковска"], ["Лазаревски", "Лазаревска"], ["Блажевски", "Блажевска"], ["Крстевски", "Крстевска"],
  ["Манчевски", "Манчевска"], ["Пановски", "Пановска"], ["Христовски", "Христовска"], ["Тошевски", "Тошевска"],
  ["Наумовски", "Наумовска"], ["Јаневски", "Јаневска"], ["Стефановски", "Стефановска"], ["Милевски", "Милевска"],
];

const ANON_TEXTS = [
  "Може ли да го повторите последниот пример на таблата?",
  "Дали ова ќе го има на контролната?",
  "Не разбрав зошто тука се менува знакот.",
  "Може ли уште еден пример за домашна работа?",
  "Колку време имаме да ја предадеме работата?",
  "Можете ли побавно да го објасните последниот чекор?",
  "Каде можеме да вежбаме уште задачи од ова?",
  "Дали формулата мора да се памти или ќе ни се даде?",
  "Не стигнав да препишам од таблата. Може ли да остане малку подолго?",
  "Зошто решението не може да биде негативно?",
];

// ---- The demo schools ------------------------------------------------------------------------

type ClassDef = {
  id: string;
  name: string;
  year: number;
  subject: Subject;
  size: number;
  /** The bank lessons run in the six finished lessons, oldest first. */
  lessons: string[];
  /** The hour the lesson starts. */
  hour: number;
  /** Index of a student who joined the class partway through the year, after the third lesson. */
  midYear?: number;
};

type SchoolDef = {
  type: SchoolType;
  school: { id: string; name: string; kind: SchoolKind };
  teacher: { id: string; name: string; email: string; provider: AuthProvider };
  classes: ClassDef[];
  colleagues: { id: string; name: string }[];
  /** Prepared and not run: a bank lesson, and the index of the class whose subject and year it is for. */
  prepared: { key: string; classIndex: number }[];
  /** In the school library, saved by a colleague. */
  library: { key: string; colleague: number; daysAgo: number }[];
  librarySubject: Subject;
};

const MATH: Subject = { id: "math", name: "Математика" };

export const SCHOOLS: Record<SchoolType, SchoolDef> = {
  school: {
    type: "school",
    school: { id: "sch-svetlina", name: "Гимназија „Светлина“", kind: "gymnasium" },
    teacher: { id: "t-petrovska", name: "Марија Петровска", email: "marija.petrovska@gimnazija-svetlina.example", provider: "google" },
    classes: [
      {
        id: "ii-4", name: "II-4", year: 2, subject: MATH, size: 26, hour: 8, midYear: 21,
        lessons: ["sistemi", "kvadratni-ravenki", "kvadratna-funkcija", "kvadratni-ravenki", "kvadratna-funkcija", "sistemi"],
      },
      {
        id: "iii-5", name: "III-5", year: 3, subject: MATH, size: 24, hour: 10,
        lessons: ["kvadratni-ravenki", "logaritmi", "trigonometrija", "nizi", "logaritmi", "trigonometrija"],
      },
      {
        id: "iv-1", name: "IV-1", year: 4, subject: MATH, size: 28, hour: 12, midYear: 5,
        lessons: ["nizi", "granici", "izvodi", "granici", "izvodi", "trigonometrija"],
      },
    ],
    colleagues: [
      { id: "t-iliev", name: "Зоран Илиев" },
      { id: "t-stojanovska", name: "Билјана Стојановска" },
    ],
    prepared: [
      { key: "procenti", classIndex: 0 },
      { key: "verojatnost", classIndex: 2 },
    ],
    library: [
      { key: "planimetrija", colleague: 0, daysAgo: 12 },
      { key: "statistika", colleague: 1, daysAgo: 20 },
      { key: "kombinatorika", colleague: 0, daysAgo: 33 },
    ],
    librarySubject: MATH,
  },
  university: {
    type: "university",
    school: { id: "fac-demo", name: "Математички факултет „Демо“", kind: "faculty" },
    teacher: { id: "t-petrovska", name: "Марија Петровска", email: "marija.petrovska@mat-fakultet.example", provider: "microsoft" },
    classes: [
      {
        id: "g-1a", name: "Група 1А", year: 1, subject: { id: "analysis-1", name: "Математичка анализа 1" }, size: 28, hour: 9, midYear: 24,
        lessons: ["nizi", "granici", "granici", "izvodi", "izvodi", "integrali"],
      },
      {
        id: "g-2b", name: "Група 2Б", year: 2, subject: { id: "linear-algebra", name: "Линеарна алгебра" }, size: 24, hour: 11,
        lessons: ["sistemi", "matrici", "sistemi", "matrici", "matrici", "sistemi"],
      },
      {
        id: "g-3a", name: "Група 3А", year: 3, subject: { id: "probability", name: "Веројатност и статистика" }, size: 22, hour: 13, midYear: 3,
        lessons: ["kombinatorika", "verojatnost", "kombinatorika", "verojatnost", "verojatnost", "kombinatorika"],
      },
    ],
    colleagues: [
      { id: "t-iliev", name: "Зоран Илиев" },
      { id: "t-stojanovska", name: "Билјана Стојановска" },
    ],
    prepared: [
      { key: "logaritmi", classIndex: 0 },
      { key: "trigonometrija", classIndex: 0 },
    ],
    library: [
      { key: "statistika", colleague: 1, daysAgo: 9 },
      { key: "kvadratna-funkcija", colleague: 0, daysAgo: 27 },
    ],
    librarySubject: MATH,
  },
};

// ---- The world: rosters and finished lessons --------------------------------------------------

export type SeedStudent = {
  id: string;
  full_name: string;
  /** How likely the student is to be right, 0 to 1. */
  ability: number;
  /** How likely the student is to be in class, 0 to 1. */
  reliability: number;
  /** Set for a student who joined the class partway through the year. */
  joined_class_at: number | null;
};

export type SeedQuestion = { id: string; question: Question; skipped: boolean; fired_at: number; closes_at: number };

export type SeedMark = {
  student_id: string;
  status: AttendanceStatus;
  reason: NoDeviceReason | null;
  joined_at: number | null;
  marked_by: "student" | "teacher" | "system";
};

export type SeedAnswer = {
  student_id: string;
  question_id: string;
  response: string | null;
  correct: boolean;
  points: number;
  speed_bonus: number;
};

export type SeedSession = {
  id: string;
  course_id: string;
  lesson_id: string;
  lesson_title: string;
  lesson_key: string;
  started_at: number;
  ended_at: number;
  questions: SeedQuestion[];
  marks: SeedMark[];
  answers: SeedAnswer[];
  anon: { id: string; sender_id: string; text: string; created_at: number; answered_at: number | null }[];
  focus: { student_id: string; question_id: string; lost_at: number; back_at: number }[];
  practice: { id: string; created_at: number; question_ids: string[]; results: { student_id: string; score: number | null; completed_at: number | null }[] } | null;
};

export type SeedCourse = {
  def: ClassDef;
  course_id: string;
  class_id: string;
  students: SeedStudent[];
  /** Oldest first. */
  sessions: SeedSession[];
};

export type World = { def: SchoolDef; anchor: number; courses: SeedCourse[] };

const NO_DEVICE: NoDeviceReason[] = ["no_phone", "battery", "no_data", "no_phone", "battery"];

/** A local time `daysBack` days before `anchor`, at the given hour, moved back from a weekend to the Friday before. */
export function lessonStart(anchor: number, daysBack: number, hour: number, minute: number): number {
  const day = new Date(anchor);
  day.setDate(day.getDate() - daysBack);
  while (day.getDay() === 0 || day.getDay() === 6) day.setDate(day.getDate() - 1);
  day.setHours(hour, minute, 0, 0);
  return day.getTime();
}

function makeRoster(def: SchoolDef, cls: ClassDef): SeedStudent[] {
  const r = rng(`${def.school.id}/${cls.id}/roster`);
  const used = new Set<string>();
  const people: { name: string; surname: string }[] = [];
  while (people.length < cls.size) {
    const female = r() < 0.5;
    const first = pick(r, female ? FEMALE : MALE);
    const surname = pick(r, SURNAMES)[female ? 1 : 0];
    if (surname.startsWith("Петровск")) continue;
    const name = `${first} ${surname}`;
    if (used.has(name)) continue;
    used.add(name);
    people.push({ name, surname });
  }
  // A register is read by surname.
  people.sort((a, b) => a.surname.localeCompare(b.surname, "mk") || a.name.localeCompare(b.name, "mk"));
  return people.map((p, i) => ({
    id: `st-${cls.id}-${String(i + 1).padStart(2, "0")}`,
    full_name: p.name,
    ability: 0.5 + r() * 0.45,
    reliability: 0.75 + r() * 0.25,
    joined_class_at: null,
  }));
}

/** A wrong response the question can have, in the encoding of spec 3.2. */
function wrongResponse(q: Question, r: Random): string {
  if (q.kind === "true_false") return q.correct === "true" ? "false" : "true";
  if (q.kind === "multiple_choice") {
    const others = q.options.map((_, i) => String(i)).filter((i) => i !== q.correct);
    return pick(r, others);
  }
  // A number clear of the right one and its tolerance, and not negative where a minus is not allowed.
  const target = Number(q.correct);
  const step = Math.max(1, q.tolerance * 3);
  let wrong = target + pick(r, [-2, -1, 1, 2, 3]) * step;
  if (wrong < 0 && !q.allow_negative) wrong = target + Math.abs(wrong - target);
  return String(Math.round(wrong * 100) / 100);
}

function seedSession(def: SchoolDef, course: SeedCourse, index: number, courseIndex: number, anchor: number): SeedSession {
  const cls = course.def;
  const key = cls.lessons[index];
  const lesson = bankLesson(key);
  const id = `s-${cls.id}-${index + 1}`;
  const r = rng(`${def.school.id}/${id}`);

  const daysBack = 3 + courseIndex + (cls.lessons.length - 1 - index) * 7;
  const started_at = lessonStart(anchor, daysBack, cls.hour, 5);

  // Every fourth lesson or so one question is skipped by the teacher (BR-SKIP-01): nobody scores on it.
  const skipIndex = (courseIndex * 6 + index) % 9 === 4 ? 2 : -1;
  let clock = started_at + Math.round(between(r, 3, 5)) * 60_000;
  const questions: SeedQuestion[] = bankQuestions(lesson, `${id}`).map((question, i) => {
    const fired_at = clock;
    const closes_at = fired_at + question.timer_seconds * 1000;
    clock = closes_at + Math.round(between(r, 3, 5)) * 60_000;
    return { id: `${id}-sq${i + 1}`, question, skipped: i === skipIndex, fired_at, closes_at };
  });
  // A lesson lasts about 45 minutes, and never ends before its last question has closed.
  const ended_at = Math.max(started_at + Math.round(between(r, 38, 45)) * 60_000, clock);

  const marks: SeedMark[] = [];
  const answers: SeedAnswer[] = [];
  const focus: SeedSession["focus"] = [];
  const present: SeedStudent[] = [];

  for (const student of course.students) {
    if (student.joined_class_at !== null && student.joined_class_at > started_at) continue;
    const draw = r();
    const absent = draw < (1 - student.reliability) * 0.6;
    const noDevice = !absent && draw > 0.975;
    const late = !absent && !noDevice && draw > 0.9;
    if (absent) {
      marks.push({ student_id: student.id, status: "absent", reason: null, joined_at: null, marked_by: "system" });
    } else if (noDevice) {
      marks.push({ student_id: student.id, status: "present_no_device", reason: pick(r, NO_DEVICE), joined_at: null, marked_by: "teacher" });
    } else {
      const joined_at = started_at + Math.round(late ? between(r, 7, 24) : between(r, 0.2, 2.5)) * 60_000;
      marks.push({ student_id: student.id, status: late ? "late" : "present", reason: null, joined_at, marked_by: "student" });
      present.push(student);
    }
  }

  const joinedAt = new Map(marks.map((m) => [m.student_id, m.joined_at]));
  questions.forEach((sq, i) => {
    if (sq.skipped) return;
    const duration = sq.question.timer_seconds * 1000;
    for (const student of present) {
      // A student who came late did not see the questions fired before they joined.
      if ((joinedAt.get(student.id) ?? 0) > sq.fired_at) continue;
      if (r() < 0.012) {
        const lost_at = sq.fired_at + Math.round(between(r, 0.1, 0.7) * duration);
        focus.push({ student_id: student.id, question_id: sq.id, lost_at, back_at: lost_at + Math.round(between(r, 4, 45)) * 1000 });
      }
      if (r() < 0.05) continue; // no answer
      const chance = Math.min(0.97, Math.max(0.15, student.ability - lesson.difficulty - i * 0.02));
      const correct = r() < chance;
      const spent = Math.min(0.97, correct ? between(r, 0.12, 0.72) : between(r, 0.25, 0.95)) * duration;
      const score = scoreAnswer({ correct, remainingMs: duration - spent, durationMs: duration, speedBonusOn: true });
      answers.push({
        student_id: student.id,
        question_id: sq.id,
        response: correct ? sq.question.correct : wrongResponse(sq.question, r),
        correct,
        points: score.points,
        speed_bonus: score.speed_bonus,
      });
    }
  });

  const anon: SeedSession["anon"] = [];
  const asks = r() < 0.45 ? 1 : r() < 0.2 ? 2 : 0;
  for (let k = 0; k < asks && present.length > 0; k++) {
    const created_at = started_at + Math.round(between(r, 8, 30)) * 60_000;
    const answered = index < cls.lessons.length - 1 || r() < 0.5;
    anon.push({
      id: `${id}-a${k + 1}`,
      sender_id: pick(r, present).id,
      text: ANON_TEXTS[(hashSeed(id) + k * 3) % ANON_TEXTS.length],
      created_at,
      answered_at: answered ? created_at + Math.round(between(r, 5, 25)) * 60_000 : null,
    });
  }

  // A practice set after some lessons (F-12): the questions the class missed, and who did it.
  let practice: SeedSession["practice"] = null;
  if (index === 1 || index === 4) {
    const candidates = questions.map((sq, i) => {
      const given = new Map(answers.filter((a) => a.question_id === sq.id).map((a) => [a.student_id, a.correct]));
      return { id: sq.id, order: i, skipped: sq.skipped, joined: present.length, missed: present.filter((s) => !given.get(s.id)).length };
    });
    const picked = selectPracticeQuestions(candidates);
    if (picked.length > 0) {
      const created_at = ended_at + 18 * 3_600_000;
      const results = present.map((student) => {
        const started = r() < 0.78;
        const done = started && r() < 0.72;
        const completed_at = done ? Math.min(anchor - 3_600_000, created_at + Math.round(between(r, 0.3, 2.5) * DAY_MS)) : null;
        let score = 0;
        for (let q = 0; q < picked.length; q++) if (r() < student.ability) score++;
        return { student_id: student.id, score: done ? score : null, completed_at };
      });
      practice = { id: `pr-${id}`, created_at, question_ids: picked, results };
    }
  }

  return {
    id,
    course_id: course.course_id,
    lesson_id: lessonIdOf(key),
    lesson_title: lesson.title,
    lesson_key: key,
    started_at,
    ended_at,
    questions,
    marks,
    answers,
    anon,
    focus,
    practice,
  };
}

/** The id of one of the teacher's own lessons made from a bank lesson. */
export const lessonIdOf = (key: string) => `l-${key}`;
/** The id of a lesson a colleague saved in the school library. */
export const libraryIdOf = (key: string) => `lib-${key}`;

const worlds = new Map<string, World>();

/** A demo school with its history, as of `anchor` (a local midnight). The same inputs always give the same world. */
export function buildWorld(type: SchoolType, anchor: number): World {
  const cacheKey = `${type}@${anchor}`;
  const cached = worlds.get(cacheKey);
  if (cached) return cached;
  const def = SCHOOLS[type];

  const courses: SeedCourse[] = def.classes.map((cls) => ({
    def: cls,
    course_id: `course-${cls.id}`,
    class_id: `class-${cls.id}`,
    students: makeRoster(def, cls),
    sessions: [],
  }));

  courses.forEach((course, courseIndex) => {
    const cls = course.def;
    if (cls.midYear !== undefined) {
      // They joined the class two days before its fourth lesson.
      const fourth = lessonStart(anchor, 3 + courseIndex + (cls.lessons.length - 4) * 7, cls.hour, 5);
      course.students[cls.midYear].joined_class_at = fourth - 2 * DAY_MS;
    }
    course.sessions = cls.lessons.map((_, i) => seedSession(def, course, i, courseIndex, anchor));
  });

  const world: World = { def, anchor, courses };
  if (worlds.size > 8) worlds.clear();
  worlds.set(cacheKey, world);
  return world;
}

/** The season's points of one student in one course. */
export const studentPoints = (course: SeedCourse, studentId: string) =>
  course.sessions.reduce((sum, s) => sum + s.answers.filter((a) => a.student_id === studentId).reduce((t, a) => t + a.points, 0), 0);

/** The ranking of a finished lesson: everyone who joined starts at 0 (BR-PTS-09). */
export function sessionBoard(course: SeedCourse, session: SeedSession) {
  const names = new Map(course.students.map((s) => [s.id, s.full_name]));
  const points = new Map<string, number>();
  for (const m of session.marks) if (m.status === "present" || m.status === "late") points.set(m.student_id, 0);
  for (const a of session.answers) points.set(a.student_id, (points.get(a.student_id) ?? 0) + a.points);
  return rankRows([...points].map(([student_id, p]) => ({ student_id, name: names.get(student_id) ?? "", points: p })));
}
