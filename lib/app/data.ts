export type Locale = "mk" | "en";

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
export type Tone = "yellow" | "ice" | "deep";

export type Subject = {
  id: SubjectId;
  /** Code carried by the class QR the teacher shows on the board. Only the four subjects with a
      live quiz in the demo have one. */
  code?: string;
  tone: Tone;
  glyphs: string;
  /** A letter where the subject has one (π, Ω, Ѓ, Aa, Ä); the rest use an icon (SubjectMark). */
  mark?: string;
  room: number | "gym";
};
export type ClassSubject = Subject & { code: string };

/** Seventh grade, class 7B: the subjects and weekly hours of a Macedonian primary school. */
export const SUBJECTS: Subject[] = [
  { id: "mkd", code: "MKD-7B", tone: "deep", glyphs: "Ѓ  Љ  Њ  Ќ", mark: "Ѓ", room: 8 },
  { id: "math", code: "MATH-7B", tone: "yellow", glyphs: "÷ 3,14 × ∑", mark: "π", room: 12 },
  { id: "english", code: "ENG-7B", tone: "yellow", glyphs: "Aa  Bb  Zz", mark: "Aa", room: 15 },
  { id: "german", tone: "ice", glyphs: "Ää  Öö  ß", mark: "Ä", room: 16 },
  { id: "physics", code: "PHYS-7B", tone: "ice", glyphs: "F=ma  ν  Ω", mark: "Ω", room: 21 },
  { id: "biology", tone: "yellow", glyphs: "CO₂  H₂O", room: 22 },
  { id: "history", tone: "deep", glyphs: "1903  1944  1991", room: 9 },
  { id: "geography", tone: "ice", glyphs: "41°N  21°E", room: 10 },
  { id: "informatics", tone: "deep", glyphs: "</>  {}  01", room: 31 },
  { id: "art", tone: "yellow", glyphs: "RGB  CMYK", room: 4 },
  { id: "music", tone: "ice", glyphs: "♩ ♪ ♫ ♬", room: 5 },
  { id: "pe", tone: "deep", glyphs: "4×100  1:0", room: "gym" },
];

export const CLASS_SUBJECTS = SUBJECTS.filter((s): s is ClassSubject => !!s.code);

export const subjectById = (id: string) => SUBJECTS.find((s) => s.id === id);
export const subjectByCode = (code: string) =>
  CLASS_SUBJECTS.find((s) => s.code.toLowerCase() === code.trim().toLowerCase());

export type DayId = "mon" | "tue" | "wed" | "thu" | "fri";
export const DAYS: DayId[] = ["mon", "tue", "wed", "thu", "fri"];
export type SlotKind = "lesson" | "test" | "pop";

/**
 * Lessons are 40 minutes, with a 20-minute break after the third. Many Macedonian schools teach in
 * two shifts; class 7B swaps between them every week (SHIFT_FROM in clock.ts).
 */
export type Shift = "morning" | "afternoon";
export const PERIODS: Record<Shift, [string, string][]> = {
  morning: [
    ["08:00", "08:40"],
    ["08:45", "09:25"],
    ["09:30", "10:10"],
    ["10:30", "11:10"],
    ["11:15", "11:55"],
    ["12:00", "12:40"],
  ],
  afternoon: [
    ["13:00", "13:40"],
    ["13:45", "14:25"],
    ["14:30", "15:10"],
    ["15:30", "16:10"],
    ["16:15", "16:55"],
    ["17:00", "17:40"],
  ],
};

/** The class timetable, the same every week. Slot n is period n + 1. */
export const WEEK: { day: DayId; slots: { subject: SubjectId; kind: SlotKind }[] }[] = [
  {
    day: "mon",
    slots: [
      { subject: "math", kind: "lesson" },
      { subject: "mkd", kind: "lesson" },
      { subject: "english", kind: "lesson" },
      { subject: "history", kind: "lesson" },
      { subject: "pe", kind: "lesson" },
      { subject: "art", kind: "lesson" },
    ],
  },
  {
    day: "tue",
    slots: [
      { subject: "physics", kind: "test" },
      { subject: "english", kind: "lesson" },
      { subject: "mkd", kind: "lesson" },
      { subject: "geography", kind: "lesson" },
      { subject: "biology", kind: "lesson" },
      { subject: "music", kind: "lesson" },
    ],
  },
  {
    day: "wed",
    slots: [
      { subject: "german", kind: "lesson" },
      { subject: "math", kind: "pop" },
      { subject: "mkd", kind: "lesson" },
      { subject: "pe", kind: "lesson" },
      { subject: "history", kind: "lesson" },
    ],
  },
  {
    day: "thu",
    slots: [
      { subject: "english", kind: "lesson" },
      { subject: "math", kind: "lesson" },
      { subject: "physics", kind: "lesson" },
      { subject: "geography", kind: "lesson" },
      { subject: "informatics", kind: "lesson" },
    ],
  },
  {
    day: "fri",
    slots: [
      { subject: "mkd", kind: "lesson" },
      { subject: "math", kind: "lesson" },
      { subject: "biology", kind: "lesson" },
      { subject: "german", kind: "lesson" },
      { subject: "pe", kind: "lesson" },
    ],
  },
];

export type AttendanceStatus = "present" | "late" | "absent";

/** The teacher's register for lessons with no scan, by day and period; any other lesson is present. */
export const SAMPLE_MARKS: Partial<Record<`${DayId}-${number}`, AttendanceStatus>> = {
  "mon-3": "late",
  "thu-2": "absent",
};

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
export const NOTIFS: { id: NotifId; subject: SubjectId; when: string; link: string }[] = [
  { id: "n-math", subject: "math", when: "2026-10-12T09:40", link: "/app/summary" },
  { id: "n-physics", subject: "physics", when: "2026-10-11T14:05", link: "/app/subject/physics" },
  { id: "n-late", subject: "physics", when: "2026-10-08T08:12", link: "/app/attendance" },
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
export const FAQ_IDS = ["f1", "f2", "f3", "f4"] as const;

export const ACHIEVEMENTS = ["answer", "ontime", "streak", "perfect"] as const;
export type AchievementId = (typeof ACHIEVEMENTS)[number];
