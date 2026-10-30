export type Lang = "mk" | "en";

/** One chapter scene of the teacher story: its index, label, display line and copy. */
export type Scene = {
  id: string;
  index: string;
  label: string;
  title: string;
  body: string;
};

export type SiteV2Dict = {
  lang: Lang;
  meta: { title: string; description: string };
  nav: {
    home: string;
    links: { href: string; label: string }[];
    cta: string;
    menu: string;
    close: string;
    skip: string;
    switchLabel: string;
    switchShort: string;
    switchHref: string;
  };
  hero: {
    kicker: string;
    title: string[];
    deck: string;
    cta: string;
    secondary: string;
    meta: string[];
    /** The pinned scene: the one phone becomes the class, and every student answers. */
    class: { of: string; label: string; alt: string };
  };
  teacher: { label: string; title: string; body: string };
  prepare: Scene & { refineLabel: string; refinements: string[]; kinds: string };
  /** The pinned sync scene: one caption per beat (join, send, answers, reveal). */
  live: Scene & { steps: string[]; join: string; anonymous: string };
  after: Scene & { practice: string; note: string };
  results: Scene;
  /** The student chapter: the opener, joining by scan, and the pinned answer scene. */
  student: { label: string; title: string; body: string };
  scan: Scene & { note: string };
  answer: Scene & { steps: string[] };
  book: { title: string; body: string; cta: string; email: string; pilot: string };
  footer: { line: string; langLabel: string; langs: { href: string; label: string; lang: Lang }[] };
  screens: {
    example: string;
    /** What each device shows, read out in place of the placeholder interface. */
    alt: {
      console: string;
      board: string;
      phone: string;
      prepare: string;
      live: string;
      end: string;
      results: string;
      scan: string;
      answer: string;
    };
    /** The teacher app's sidebar, for the screens that are still drawn. */
    console: { nav: string[] };
    board: {
      course: string;
      progress: string;
      question: string;
      answers: string[];
      timer: string;
      answered: { n: string; of: string };
      /** Before the first question: the join code and who is in. */
      lobby: { scan: string; code: string; joined: string; of: string };
    };
    live: {
      course: string;
      state: string;
      end: string;
      joined: string;
      answered: string;
      of: string;
      send: string;
      sent: string;
      reveal: string;
      questions: string[];
    };
    end: {
      title: string;
      course: string;
      stats: { n: string; label: string }[];
      copy: string;
      missedTitle: string;
      missed: { text: string; pct: number }[];
      missedUnit: string;
      practice: string;
    };
    results: {
      title: string;
      attendanceLabel: string;
      attendance: number[];
      weakTitle: string;
      weak: { topic: string; pct: number }[];
      weakUnit: string;
      askedTitle: string;
      asked: string[];
    };
  };
};
