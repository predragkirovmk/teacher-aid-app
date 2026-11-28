/**
 * The teacher guide film (Рики walks through one lesson, in Macedonian, captions burned in), shown on the website and in the
 * teacher app. Its files are named "teacher-" because the live build on app.teacheraid.education serves only such paths
 * (LIVE_PATHS in next.config.ts); the website serves the same files from its own origin. Source and build: ~/Desktop/TeacherAid/teacheraid-guide.
 */
export const GUIDE_VIDEO = {
  src: "/teacher-guide.mp4",
  poster: "/teacher-guide.jpg",
  width: 1920,
  height: 1080,
  /** ISO 8601, for the page's VideoObject. */
  duration: "PT2M59S",
  uploaded: "2026-11-27T12:00:00+01:00",
};

/** Where each chapter starts, in seconds (the film's chapters.txt), and its name in each language. */
export const GUIDE_CHAPTERS = [
  { at: 0, mk: "Здраво", en: "Hello" },
  { at: 11, mk: "Лекции", en: "Lessons" },
  { at: 17, mk: "Подготви лекција", en: "Prepare a lesson" },
  { at: 41, mk: "Прегледај и смени", en: "Review and change" },
  { at: 73, mk: "Почни го часот", en: "Start the lesson" },
  { at: 101, mk: "Во час", en: "In class" },
  { at: 135, mk: "Крај на часот", en: "End of the lesson" },
  { at: 150, mk: "Библиотека", en: "Library" },
  { at: 164, mk: "Поставки и помош", en: "Settings and help" },
] as const;

/** "1:13" for 73 seconds. */
export const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
