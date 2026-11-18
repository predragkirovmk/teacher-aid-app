import { rankRows, scoreAnswer, selectPracticeQuestions } from "../scoring";
import type { SchoolType } from "../store";
import { bankLesson, bankQuestions } from "./mock-bank";
import type { AuthProvider, Question, SchoolKind } from "./types";

/**
 * The demo schools the mock adapter plays, and their history. Everything is invented: the teacher
 * Марија Петровска, her colleagues, a secondary school and a faculty that do not exist, and the
 * students. The history (a few finished lessons, with who came, answers and points) is
 * worked out from a seed, so it is the same every time for the same day, and the points come from
 * the scoring rules of spec 8 (scoring.ts), so a lesson's numbers add up.
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

/** A weekly rhythm of finished lessons: the bank lessons run, oldest first, at the same hour, one a week. */
type HeldSeries = { id: string; hour: number; keys: string[] };

type SchoolDef = {
  type: SchoolType;
  school: { id: string; name: string; kind: SchoolKind };
  teacher: { id: string; name: string; email: string; provider: AuthProvider };
  /** A teacher the school's admin has just invited: signs in for the first time, has run nothing and made no lesson. */
  novice: { id: string; name: string; email: string; provider: AuthProvider };
  /** The demo students who scan the code in a live lesson and fill the finished lessons. Not a roster: nobody is enrolled anywhere. */
  pool: { seed: string; size: number };
  /** The lessons held in the past, as weekly rhythms. */
  held: HeldSeries[];
  colleagues: { id: string; name: string }[];
  /** Prepared and not run: bank lessons. */
  prepared: string[];
  /** In the school library, saved by a colleague: a bank lesson, the colleague (an index of `colleagues`) and when. */
  library: { key: string; colleague: number; daysAgo: number }[];
};

export const SCHOOLS: Record<SchoolType, SchoolDef> = {
  school: {
    type: "school",
    school: { id: "sch-svetlina", name: "Гимназија „Светлина“", kind: "gymnasium" },
    teacher: { id: "t-petrovska", name: "Марија Петровска", email: "marija.petrovska@gimnazija-svetlina.example", provider: "google" },
    novice: { id: "t-arsovski", name: "Игор Арсовски", email: "igor.arsovski@gimnazija-svetlina.example", provider: "google" },
    // The names are those of the first class the demo used to have, so a lesson still meets the same students.
    pool: { seed: "ii-4", size: 26 },
    held: [
      {
        id: "a",
        hour: 8,
        keys: [
          "planimetrija", "kombinatorika", "statistika", "sistemi",
          "sistemi", "kvadratni-ravenki", "kvadratna-funkcija", "kvadratni-ravenki", "kvadratna-funkcija", "sistemi",
        ],
      },
      { id: "b", hour: 10, keys: ["kvadratni-ravenki", "logaritmi", "trigonometrija", "nizi", "logaritmi", "trigonometrija"] },
      { id: "c", hour: 12, keys: ["nizi", "granici", "izvodi", "granici", "izvodi", "trigonometrija"] },
    ],
    colleagues: [
      { id: "t-iliev", name: "Зоран Илиев" },
      { id: "t-stojanovska", name: "Билјана Стојановска" },
      { id: "t-avramovska", name: "Весна Аврамовска" },
    ],
    prepared: ["procenti", "verojatnost"],
    library: [
      { key: "dvizenje", colleague: 2, daysAgo: 6 },
      { key: "planimetrija", colleague: 0, daysAgo: 12 },
      { key: "njutn", colleague: 2, daysAgo: 15 },
      { key: "statistika", colleague: 1, daysAgo: 20 },
      { key: "kombinatorika", colleague: 0, daysAgo: 33 },
    ],
  },
  university: {
    type: "university",
    school: { id: "fac-demo", name: "Математички факултет „Демо“", kind: "faculty" },
    teacher: { id: "t-petrovska", name: "Марија Петровска", email: "marija.petrovska@mat-fakultet.example", provider: "microsoft" },
    novice: { id: "t-arsovski", name: "Игор Арсовски", email: "igor.arsovski@mat-fakultet.example", provider: "microsoft" },
    pool: { seed: "g-1a", size: 28 },
    held: [
      {
        id: "a",
        hour: 9,
        keys: [
          "nizi", "nizi", "granici", "izvodi",
          "nizi", "granici", "granici", "izvodi", "izvodi", "integrali",
        ],
      },
      { id: "b", hour: 11, keys: ["sistemi", "matrici", "sistemi", "matrici", "matrici", "sistemi"] },
      { id: "c", hour: 13, keys: ["kombinatorika", "verojatnost", "kombinatorika", "verojatnost", "verojatnost", "kombinatorika"] },
    ],
    colleagues: [
      { id: "t-iliev", name: "Зоран Илиев" },
      { id: "t-stojanovska", name: "Билјана Стојановска" },
      { id: "t-ristevski", name: "Драган Ристевски" },
    ],
    prepared: ["logaritmi", "trigonometrija"],
    library: [
      { key: "statistika", colleague: 1, daysAgo: 9 },
      { key: "matrici", colleague: 0, daysAgo: 14 },
      { key: "integrali", colleague: 2, daysAgo: 21 },
      { key: "kombinatorika", colleague: 1, daysAgo: 30 },
    ],
  },
};

// ---- The world: the student pool and finished lessons -----------------------------------------

export type SeedStudent = {
  id: string;
  full_name: string;
  /** How likely the student is to be right, 0 to 1. */
  ability: number;
  /** How likely the student is to be in the lesson, 0 to 1. */
  reliability: number;
};

export type SeedQuestion = { id: string; question: Question; skipped: boolean; fired_at: number; closes_at: number };

/** A student who scanned the code in a finished lesson, and when. Only those who came are kept. */
export type SeedJoin = { student_id: string; joined_at: number };

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
  lesson_id: string;
  lesson_title: string;
  lesson_key: string;
  started_at: number;
  ended_at: number;
  questions: SeedQuestion[];
  joins: SeedJoin[];
  answers: SeedAnswer[];
  anon: { id: string; sender_id: string; text: string; created_at: number; answered_at: number | null }[];
  focus: { student_id: string; question_id: string; lost_at: number; back_at: number }[];
  practice: { id: string; created_at: number; question_ids: string[]; results: { student_id: string; score: number | null; completed_at: number | null }[] } | null;
};

export type World = {
  def: SchoolDef;
  anchor: number;
  /** The demo students: the pool a live lesson draws its joiners from and the finished lessons' students come from. */
  students: SeedStudent[];
  /** Every finished lesson, oldest first. */
  sessions: SeedSession[];
};

/** A local time `daysBack` days before `anchor`, at the given hour, moved back from a weekend to the Friday before. */
export function lessonStart(anchor: number, daysBack: number, hour: number, minute: number): number {
  const day = new Date(anchor);
  day.setDate(day.getDate() - daysBack);
  while (day.getDay() === 0 || day.getDay() === 6) day.setDate(day.getDate() - 1);
  day.setHours(hour, minute, 0, 0);
  return day.getTime();
}

function makePool(def: SchoolDef): SeedStudent[] {
  const r = rng(`${def.school.id}/${def.pool.seed}/roster`);
  const used = new Set<string>();
  const people: { name: string; surname: string }[] = [];
  while (people.length < def.pool.size) {
    const female = r() < 0.5;
    const first = pick(r, female ? FEMALE : MALE);
    const surname = pick(r, SURNAMES)[female ? 1 : 0];
    if (surname.startsWith("Петровск")) continue;
    const name = `${first} ${surname}`;
    if (used.has(name)) continue;
    used.add(name);
    people.push({ name, surname });
  }
  // Sorted by surname, as the names were first drawn.
  people.sort((a, b) => a.surname.localeCompare(b.surname, "mk") || a.name.localeCompare(b.name, "mk"));
  return people.map((p, i) => ({
    id: `st-${String(i + 1).padStart(2, "0")}`,
    full_name: p.name,
    ability: 0.5 + r() * 0.45,
    reliability: 0.75 + r() * 0.25,
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

function seedSession(def: SchoolDef, students: SeedStudent[], series: HeldSeries, seriesIndex: number, index: number, anchor: number): SeedSession {
  const key = series.keys[index];
  const lesson = bankLesson(key);
  const id = `s-${series.id}-${index + 1}`;
  const r = rng(`${def.school.id}/${id}`);

  const daysBack = 3 + seriesIndex + (series.keys.length - 1 - index) * 7;
  const started_at = lessonStart(anchor, daysBack, series.hour, 5);

  // Every fourth lesson or so one question is skipped by the teacher (BR-SKIP-01): nobody scores on it.
  const skipIndex = (seriesIndex * 6 + index) % 9 === 4 ? 2 : -1;
  let clock = started_at + Math.round(between(r, 3, 5)) * 60_000;
  const questions: SeedQuestion[] = bankQuestions(lesson, `${id}`).map((question, i) => {
    const fired_at = clock;
    const closes_at = fired_at + question.timer_seconds * 1000;
    clock = closes_at + Math.round(between(r, 3, 5)) * 60_000;
    return { id: `${id}-sq${i + 1}`, question, skipped: i === skipIndex, fired_at, closes_at };
  });
  // A lesson lasts about 45 minutes, and never ends before its last question has closed.
  const ended_at = Math.max(started_at + Math.round(between(r, 38, 45)) * 60_000, clock);

  const joins: SeedJoin[] = [];
  const answers: SeedAnswer[] = [];
  const focus: SeedSession["focus"] = [];

  // Whoever did not scan the code is simply not in the lesson: a finished lesson keeps only the students who were there.
  for (const student of students) {
    const draw = r();
    if (draw < (1 - student.reliability) * 0.6 || draw > 0.975) continue;
    const late = draw > 0.9;
    joins.push({ student_id: student.id, joined_at: started_at + Math.round(late ? between(r, 7, 24) : between(r, 0.2, 2.5)) * 60_000 });
  }

  const joinedAt = new Map(joins.map((j) => [j.student_id, j.joined_at]));
  const present = students.filter((s) => joinedAt.has(s.id));
  questions.forEach((sq, i) => {
    if (sq.skipped) return;
    const duration = sq.question.timer_seconds * 1000;
    for (const student of present) {
      // A student who came in late did not see the questions fired before they joined.
      if ((joinedAt.get(student.id) ?? 0) > sq.fired_at) continue;
      if (r() < 0.012) {
        const lost_at = sq.fired_at + Math.round(between(r, 0.1, 0.7) * duration);
        focus.push({ student_id: student.id, question_id: sq.id, lost_at, back_at: lost_at + Math.round(between(r, 4, 45)) * 1000 });
      }
      if (r() < 0.05) continue; // no answer
      const chance = Math.min(0.97, Math.max(0.15, student.ability - lesson.difficulty - i * 0.02));
      const correct = r() < chance;
      const spent = Math.min(0.97, correct ? between(r, 0.12, 0.72) : between(r, 0.25, 0.95)) * duration;
      const score = scoreAnswer({ correct, remainingMs: duration - spent, durationMs: duration });
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
  for (let k = 0; k < asks; k++) {
    const created_at = started_at + Math.round(between(r, 8, 30)) * 60_000;
    // Only a student who was already in the lesson can ask in it.
    const askers = present.filter((s) => (joinedAt.get(s.id) ?? 0) <= created_at);
    if (askers.length === 0) continue;
    const answered = index < series.keys.length - 1 || r() < 0.5;
    anon.push({
      id: `${id}-a${k + 1}`,
      sender_id: pick(r, askers).id,
      text: ANON_TEXTS[(hashSeed(id) + k * 3) % ANON_TEXTS.length],
      created_at,
      // The teacher answers aloud, so before the lesson ends.
      answered_at: answered ? Math.min(ended_at, created_at + Math.round(between(r, 5, 25)) * 60_000) : null,
    });
  }

  // A practice set after some lessons (F-12): the questions the class missed, and who did it.
  let practice: SeedSession["practice"] = null;
  if (index % 3 === 1) {
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
    lesson_id: lessonIdOf(key),
    lesson_title: lesson.title,
    lesson_key: key,
    started_at,
    ended_at,
    questions,
    joins,
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
  const students = makePool(def);
  const sessions = def.held
    .flatMap((series, seriesIndex) => series.keys.map((_, i) => seedSession(def, students, series, seriesIndex, i, anchor)))
    .sort((a, b) => a.started_at - b.started_at);

  const world: World = { def, anchor, students, sessions };
  if (worlds.size > 8) worlds.clear();
  worlds.set(cacheKey, world);
  return world;
}

/** The ranking of a finished lesson: everyone who joined starts at 0 (BR-PTS-09). */
export function sessionBoard(world: Pick<World, "students">, session: SeedSession) {
  const names = new Map(world.students.map((s) => [s.id, s.full_name]));
  const points = new Map<string, number>();
  for (const j of session.joins) points.set(j.student_id, 0);
  for (const a of session.answers) points.set(a.student_id, (points.get(a.student_id) ?? 0) + a.points);
  return rankRows([...points].map(([student_id, p]) => ({ student_id, name: names.get(student_id) ?? "", points: p })));
}
