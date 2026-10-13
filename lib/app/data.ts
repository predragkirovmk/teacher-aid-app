export type Locale = "mk" | "en";

export type SubjectId = "math" | "physics" | "mkd" | "english";
export type Tone = "yellow" | "ice" | "deep";

export type Subject = {
  id: SubjectId;
  /** Code carried by the class QR the teacher shows on the board. */
  code: string;
  tone: Tone;
  glyphs: string;
  initials: string;
};

export const SUBJECTS: Subject[] = [
  { id: "math", code: "MATH-7B", tone: "yellow", glyphs: "÷ 3,14 × ∑", initials: "JM" },
  { id: "physics", code: "PHYS-7B", tone: "ice", glyphs: "F=ma  ν  Ω", initials: "AS" },
  { id: "mkd", code: "MKD-7B", tone: "deep", glyphs: "Ѓ  Љ  Њ  Ќ", initials: "ED" },
  { id: "english", code: "ENG-7B", tone: "yellow", glyphs: "Aa  Bb  Zz", initials: "DR" },
];

export const subjectById = (id: string) => SUBJECTS.find((s) => s.id === id);
export const subjectByCode = (code: string) =>
  SUBJECTS.find((s) => s.code.toLowerCase() === code.trim().toLowerCase());

export type DayId = "mon" | "tue" | "wed" | "thu" | "fri";
export type SlotKind = "lesson" | "test" | "pop";

export const WEEK: { day: DayId; date: number; slots: { time: string; subject: SubjectId; kind: SlotKind }[] }[] = [
  { day: "mon", date: 12, slots: [{ time: "08:00", subject: "math", kind: "lesson" }, { time: "09:00", subject: "mkd", kind: "lesson" }] },
  { day: "tue", date: 13, slots: [{ time: "08:00", subject: "physics", kind: "test" }, { time: "10:00", subject: "english", kind: "lesson" }] },
  { day: "wed", date: 14, slots: [{ time: "09:00", subject: "math", kind: "pop" }, { time: "11:00", subject: "physics", kind: "lesson" }] },
  { day: "thu", date: 15, slots: [{ time: "08:00", subject: "english", kind: "lesson" }, { time: "09:00", subject: "mkd", kind: "lesson" }] },
  { day: "fri", date: 16, slots: [{ time: "08:00", subject: "math", kind: "lesson" }, { time: "10:00", subject: "physics", kind: "lesson" }] },
];

export type AttendanceStatus = "present" | "late" | "absent";

/** Lessons before the demo starts: 20 attended of 23 is 87 %, and one check-in makes it 21 of 24, which is 88 %. */
export const BASE_ATTENDED = 20;
export const BASE_TOTAL = 23;
export const BASE_LOG: { id: string; subject: SubjectId; date: string; status: AttendanceStatus }[] = [
  { id: "b1", subject: "math", date: "2026-10-09", status: "present" },
  { id: "b2", subject: "mkd", date: "2026-10-08", status: "present" },
  { id: "b3", subject: "physics", date: "2026-10-08", status: "late" },
  { id: "b4", subject: "english", date: "2026-10-07", status: "present" },
  { id: "b5", subject: "math", date: "2026-10-06", status: "absent" },
  { id: "b6", subject: "physics", date: "2026-10-05", status: "present" },
];

export type NotifId = "n-math" | "n-physics" | "n-late";
export const NOTIFS: { id: NotifId; subject: SubjectId; when: string; link: string }[] = [
  { id: "n-math", subject: "math", when: "2026-10-12T09:40", link: "/app/summary" },
  { id: "n-physics", subject: "physics", when: "2026-10-11T14:05", link: "/app/subject/physics" },
  { id: "n-late", subject: "physics", when: "2026-10-08T08:12", link: "/app/attendance" },
];

export const LEADERBOARD: { name: string; points: number; me?: boolean }[] = [
  { name: "Ana Georgievska", points: 1480 },
  { name: "Luka Stojanovski", points: 1415 },
  { name: "Mila Jovanova", points: 1360 },
  { name: "Marko Trajkovski", points: 1310, me: true },
  { name: "Nina Popovska", points: 1265 },
  { name: "Viktor Ilievski", points: 1190 },
  { name: "Sara Nikolova", points: 1120 },
  { name: "Filip Angelov", points: 1075 },
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
export const FAQ_IDS = ["f1", "f2", "f3", "f4"] as const;

export const ACHIEVEMENTS = ["first", "ontime", "streak", "perfect"] as const;
export type AchievementId = (typeof ACHIEVEMENTS)[number];
