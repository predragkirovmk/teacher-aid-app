import type { Locale } from "../types";

/**
 * The demo's fixtures: the class 7B the mock adapter plays. Nothing here is a source for the API
 * (the backend spec says so); it only gives the mock something to answer with.
 */

export type SubjectId =
  | "mkd"
  | "math"
  | "english"
  | "german"
  | "physics"
  | "biology"
  | "history"
  | "geography"
  | "informatics"
  | "art"
  | "music"
  | "pe";

export type MockSubject = {
  id: SubjectId;
  /** Code carried by the class QR the teacher shows on the board. Only the four subjects with a
      live quiz in the demo have one. */
  code?: string;
};
export type ClassSubject = MockSubject & { code: string };

/** Seventh grade, class 7B: the subjects of a Macedonian primary school. */
export const SUBJECTS: MockSubject[] = [
  { id: "mkd", code: "MKD-7B" },
  { id: "math", code: "MATH-7B" },
  { id: "english", code: "ENG-7B" },
  { id: "german" },
  { id: "physics", code: "PHYS-7B" },
  { id: "biology" },
  { id: "history" },
  { id: "geography" },
  { id: "informatics" },
  { id: "art" },
  { id: "music" },
  { id: "pe" },
];

export const CLASS_SUBJECTS = SUBJECTS.filter((s): s is ClassSubject => !!s.code);

export const subjectByCode = (code: string) =>
  CLASS_SUBJECTS.find((s) => s.code.toLowerCase() === code.trim().toLowerCase());

export type AttendanceStatus = "present" | "late" | "absent";

/** Lessons before the demo starts: 20 attended of 23 is 87 %, and one check-in makes it 21 of 24, which is 88 %. */
export const BASE_ATTENDED = 20;
export const BASE_TOTAL = 23;
/** Where attendance stood a week ago, 19 of 22 (86 %), for Home's weekly change. */
export const LAST_WEEK_ATTENDED = 19;
export const LAST_WEEK_TOTAL = 22;
export const BASE_LOG: { id: string; subject: SubjectId; date: string; status: AttendanceStatus }[] = [
  { id: "b1", subject: "math", date: "2026-10-09", status: "present" },
  { id: "b2", subject: "mkd", date: "2026-10-08", status: "present" },
  { id: "b3", subject: "physics", date: "2026-10-08", status: "late" },
  { id: "b4", subject: "english", date: "2026-10-07", status: "present" },
  { id: "b5", subject: "math", date: "2026-10-06", status: "absent" },
  { id: "b6", subject: "physics", date: "2026-10-05", status: "present" },
];

export type NotifId = "n-math" | "n-physics" | "n-late";
export const NOTIFS: { id: NotifId; subject: SubjectId; when: string }[] = [
  { id: "n-math", subject: "math", when: "2026-10-12T09:40" },
  { id: "n-physics", subject: "physics", when: "2026-10-11T14:05" },
  { id: "n-late", subject: "physics", when: "2026-10-08T08:12" },
];

/** Classmates in both scripts, like the teachers; the student's own row shows their profile name. */
export const LEADERBOARD: { id: string; name: Record<Locale, string>; points: number; me?: boolean }[] = [
  { id: "ana", name: { mk: "Ана Георгиевска", en: "Ana Georgievska" }, points: 1480 },
  { id: "luka", name: { mk: "Лука Стојановски", en: "Luka Stojanovski" }, points: 1415 },
  { id: "mila", name: { mk: "Мила Јованова", en: "Mila Jovanova" }, points: 1360 },
  { id: "me", name: { mk: "Марко Трајковски", en: "Marko Trajkovski" }, points: 1310, me: true },
  { id: "nina", name: { mk: "Нина Поповска", en: "Nina Popovska" }, points: 1265 },
  { id: "viktor", name: { mk: "Виктор Илиевски", en: "Viktor Ilievski" }, points: 1190 },
  { id: "sara", name: { mk: "Сара Николова", en: "Sara Nikolova" }, points: 1120 },
  { id: "filip", name: { mk: "Филип Ангелов", en: "Filip Angelov" }, points: 1075 },
];

/** Last maths lesson: 4 of 5 correct. */
export const QUIZ = [
  { id: "q1", correct: true },
  { id: "q2", correct: true },
  { id: "q3", correct: false },
  { id: "q4", correct: true },
  { id: "q5", correct: true },
] as const;

export const DOCS = ["d1", "d2", "d3", "d4"] as const;

export const ACHIEVEMENTS = ["answer", "ontime", "streak", "perfect"] as const;
export type AchievementId = (typeof ACHIEVEMENTS)[number];
