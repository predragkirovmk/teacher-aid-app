import type { ScreenName } from "@/components/site/screens";
import type { IconName } from "@/components/site/Icon";

export type Lang = "mk" | "en";

export type LessonStep = {
  minute: number;
  screen: ScreenName;
  icon: IconName;
  title: string;
  body: string;
  /** The phone flips to the ice result state: the section's field follows it. */
  ice?: boolean;
  alt: string;
};

export type SiteDict = {
  lang: Lang;
  meta: { title: string; description: string; ogAlt: string };
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
    title: string;
    deck: string;
    cta: string;
    secondary: string;
    anchor: string;
    anchorLabel: string;
    meta: string[];
    chips: { joined: string; joinedCount: string; reason: string; focus: string };
    phoneAlt: string;
  };
  problem: { index: string; kicker: string; lines: string[]; answer: string; note: string };
  lesson: {
    index: string;
    kicker: string;
    title: string;
    minute: string;
    stepsLabel: string;
    steps: LessonStep[];
  };
  why: {
    index: string;
    kicker: string;
    title: string;
    body: string;
    points: { value: string; label: string }[];
    research: { name: string; finding: string; cite: string }[];
  };
  teacher: {
    index: string;
    kicker: string;
    title: string;
    body: string;
    inputLabel: string;
    input: { subject: string; topic: string; focus: string };
    outputLabel: string;
    opener: { label: string; text: string };
    outputs: { title: string; body: string }[];
    refineLabel: string;
    refinements: string[];
    note: string;
    typesLabel: string;
    types: string[];
    phoneAlt: string;
  };
  report: {
    index: string;
    kicker: string;
    title: string;
    body: string;
    sample: {
      brand: string;
      month: string;
      tag: string;
      figures: { value: string; unit?: string; label: string }[];
      classesLabel: string;
      classes: string;
      summaryLabel: string;
      summary: string;
      trend: string;
      older: string[];
    };
    notes: string[];
    disclaimer: string;
  };
  trust: {
    index: string;
    kicker: string;
    title: string;
    focus: string;
    policy: string;
    policySource: string;
    offlineTitle: string;
    offlineBody: string;
    phoneAlt: string;
    items: { icon: IconName; title: string; body: string }[];
  };
  country: {
    index: string;
    kicker: string;
    figures: { value: number; prefix?: string; label: string }[];
    tail: string;
    closing: string;
    source: string;
  };
  contact: {
    index: string;
    kicker: string;
    title: string;
    body: string;
    cta: string;
    email: string;
    subject: string;
    mailBody: string;
    copy: string;
    copied: string;
    pilot: string;
  };
  footer: { line: string; made: string; rights: string };
};
