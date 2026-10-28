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
  live: Scene & { join: string; anonymous: string };
  after: Scene & { practice: string; note: string };
  results: Scene;
  book: { title: string; body: string; cta: string; email: string; pilot: string };
  footer: { line: string; langLabel: string; langs: { href: string; label: string; lang: Lang }[] };
  screens: {
    example: string;
    /** What each device shows, read out in place of the placeholder interface. */
    alt: { console: string; board: string; phone: string };
    console: {
      nav: string[];
      greet: string;
      title: string;
      prepare: string;
      lessons: { course: string; topic: string; count: string }[];
      recentTitle: string;
      recent: { value: string; label: string }[];
      start: string;
    };
    board: {
      course: string;
      progress: string;
      question: string;
      answers: string[];
      timer: string;
      answered: string;
    };
    phone: { course: string; question: string; answers: string[]; send: string };
  };
};
