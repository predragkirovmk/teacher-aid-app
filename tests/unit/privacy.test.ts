import { describe, expect, it } from "vitest";
import type { Locale, Student } from "@/lib/app/api/types";
import { dictionaries, type Key } from "@/lib/app/i18n";
import {
  CONTACT_EMAIL,
  LEAVER_DELETION_DAYS,
  NOTICE_VERSION,
  isOpenPath,
  needsNotice,
  noticeDateLabel,
  noticeWaits,
  noticeWasUpdated,
} from "@/lib/app/privacy";
import { PRIVACY, TERMS, type Block, type Doc } from "@/lib/app/privacy-copy";
import { dictionaries as quizDictionaries, type QKey } from "@/lib/app/quiz-copy";

const LOCALES: Locale[] = ["mk", "en"];
const ack = (version: string): Pick<Student, "acknowledgement"> => ({ acknowledgement: { version, at: 1 } });
const none: Pick<Student, "acknowledgement"> = { acknowledgement: null };

describe("when the notice is shown", () => {
  it("is shown to a student who has acknowledged nothing, and to one who saw an older version", () => {
    expect(needsNotice(none)).toBe(true);
    expect(needsNotice(ack("2026-01-01"))).toBe(true);
    expect(needsNotice(ack(NOTICE_VERSION))).toBe(false);
  });

  it("says the notice was updated only for a student who has seen another version", () => {
    expect(noticeWasUpdated(none)).toBe(false);
    expect(noticeWasUpdated(ack("2026-01-01"))).toBe(true);
    expect(noticeWasUpdated(ack(NOTICE_VERSION))).toBe(false);
  });

  it("is a version the API can store: 1 to 32 characters of letters, digits, dots, dashes and underscores", () => {
    expect(NOTICE_VERSION).toMatch(/^[A-Za-z0-9._-]{1,32}$/);
  });

  it("can be read without signing in: the sign-in screen, the notice and the terms, and nothing else", () => {
    for (const path of ["/app/welcome", "/app/privacy", "/app/terms"]) expect(isOpenPath(path)).toBe(true);
    for (const path of ["/app", "/app/data", "/app/profile", "/app/checkin/MATH-7B", "/app/privacy/x"]) expect(isOpenPath(path)).toBe(false);
  });

  it("waits for a lesson or a practice set in progress, and not for the check-in that starts one", () => {
    expect(noticeWaits("/app/play/MATH-7B")).toBe(true);
    expect(noticeWaits("/app/practice/ps-1")).toBe(true);
    expect(noticeWaits("/app/practice")).toBe(false);
    expect(noticeWaits("/app/checkin/MATH-7B")).toBe(false);
    expect(noticeWaits("/app")).toBe(false);
  });

  it("dates the version in the day it names, in both languages", () => {
    expect(noticeDateLabel("en")).toBe("27 October 2026");
    expect(noticeDateLabel("mk")).toBe("27 октомври 2026");
  });
});

const idsOf = (doc: Doc) => doc.sections.map((s) => `${s.level}:${s.id}`);
const shapeOf = (b: Block) => Object.keys(b)[0];
const texts = (doc: Doc) => doc.sections.flatMap((s) => [s.title, ...s.blocks.flatMap((b) => ("p" in b ? [b.p] : "ul" in b ? b.ul : []))]);

describe("the privacy notice and the terms", () => {
  it.each([
    ["privacy", PRIVACY],
    ["terms", TERMS],
  ] as const)("%s has the same sections, in the same order, with the same kinds of block, in both languages", (_name, docs) => {
    expect(idsOf(docs.mk)).toEqual(idsOf(docs.en));
    docs.mk.sections.forEach((s, i) => expect(s.blocks.map(shapeOf), s.id).toEqual(docs.en.sections[i].blocks.map(shapeOf)));
    docs.mk.sections.forEach((s, i) => {
      const lists = (d: Doc) => d.sections[i].blocks.flatMap((b) => ("ul" in b ? [b.ul.length] : []));
      expect(lists(docs.mk), s.id).toEqual(lists(docs.en));
    });
  });

  it("has unique anchors", () => {
    for (const docs of [PRIVACY, TERMS]) for (const locale of LOCALES) {
      const ids = docs[locale].sections.map((s) => s.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("has an anchor for every place in the app that links into the notice", () => {
    // Profile, Settings (alerts), the push ask (alerts), the focus line (focus), Your data (rights, phone), the welcome footer (top).
    const ids = PRIVACY.en.sections.map((s) => s.id);
    for (const id of ["focus", "alerts", "ask", "rights", "phone", "contact", "keep", "sees", "who", "collected"]) expect(ids).toContain(id);
  });

  it("links only to anchors and screens that exist", () => {
    const anchors = new Set(PRIVACY.en.sections.map((s) => s.id));
    const screens = ["/app/data", "/app/privacy", "/app/terms"];
    for (const doc of [...LOCALES.map((l) => PRIVACY[l]), ...LOCALES.map((l) => TERMS[l])]) {
      for (const text of texts(doc)) {
        for (const [, href] of text.matchAll(/\]\(([^)]+)\)/g)) {
          if (href.startsWith("mailto:")) continue;
          const [path, hash] = href.split("#");
          expect(screens, href).toContain(path);
          if (hash && path === "/app/privacy") expect(anchors.has(hash), href).toBe(true);
        }
      }
    }
  });

  it("uses only the {values} the page fills in", () => {
    for (const doc of [...LOCALES.map((l) => PRIVACY[l]), ...LOCALES.map((l) => TERMS[l])]) {
      for (const text of [...texts(doc), doc.updated, doc.version]) {
        for (const [, name] of text.matchAll(/\{(\w+)\}/g)) expect(["date", "version", "email", "days"], text).toContain(name);
      }
    }
  });

  it("shows the app's own lines for leaving the quiz, asking the teacher and notifications, not a copy of them", () => {
    const blocks = (id: string) => PRIVACY.en.sections.find((s) => s.id === id)!.blocks;
    expect(blocks("focus")).toContainEqual({ qline: "fair.note" });
    expect(blocks("ask")).toContainEqual({ qline: "ask.honest" });
    expect(blocks("alerts")).toContainEqual({ line: "push.ask.body" });
    // ...and the lines exist, in both languages.
    for (const doc of LOCALES.map((l) => PRIVACY[l])) for (const s of doc.sections) for (const b of s.blocks) {
      if ("line" in b) for (const l of LOCALES) expect(dictionaries[l][b.line as Key], b.line).toBeTruthy();
      if ("qline" in b) for (const l of LOCALES) expect(quizDictionaries[l][b.qline as QKey], b.qline).toBeTruthy();
    }
  });

  it("says the same things the spec decides about who sees what", () => {
    // Hard rules 3 and 4 of the spec: a student never sees another's answers; the school admin never sees answers, reasons, questions or topic results.
    const en = PRIVACY.en.sections;
    const classmates = en.find((s) => s.id === "sees-class")!.blocks.map((b) => ("p" in b ? b.p : "")).join(" ");
    const admin = en.find((s) => s.id === "sees-admin")!.blocks.map((b) => ("p" in b ? b.p : "")).join(" ");
    expect(classmates).toMatch(/never see your answers, your questions, your results/);
    expect(admin).toMatch(/Never your answers, reasons, questions or results by topic/);
    const mk = PRIVACY.mk.sections;
    expect(mk.find((s) => s.id === "sees-class")!.blocks.map((b) => ("p" in b ? b.p : "")).join(" ")).toMatch(/Никогаш не ги гледаат твоите одговори, прашања/);
  });

  it("says the school is responsible and TeacherAid runs the app for it, and asks for no consent", () => {
    for (const locale of LOCALES) {
      const who = PRIVACY[locale].sections.find((s) => s.id === "who")!.blocks.map((b) => ("p" in b ? b.p : "")).join(" ");
      expect(who).toMatch(locale === "en" ? /Your school is responsible/ : /Училиштето е одговорно/);
      expect(who).toContain("TeacherAid");
      expect(texts(PRIVACY[locale]).join(" ").toLowerCase()).not.toMatch(/consent|согласност|се согласувам/);
    }
  });

  it("states the retention the spec decides: the next school year, 30 days for a leaver, reports without names", () => {
    expect(LEAVER_DELETION_DAYS).toBe(30);
    for (const locale of LOCALES) {
      const keep = PRIVACY[locale].sections.find((s) => s.id === "keep")!.blocks.flatMap((b) => ("ul" in b ? b.ul : [])).join("\n");
      expect(keep).toContain("{days}");
      expect(keep).toMatch(locale === "en" ? /school year after the one it was made in/ : /училишната година што доаѓа по онаа во која настанале/);
    }
  });

  it("sends requests through the school, with no self-service delete", () => {
    for (const locale of LOCALES) {
      const rights = PRIVACY[locale].sections.find((s) => s.id === "rights")!.blocks.map((b) => ("p" in b ? b.p : "")).join(" ");
      expect(rights).toMatch(locale === "en" ? /There is no button for this in the app. You ask your school/ : /Во апликацијата нема копче за ова. Го бараш од училиштето/);
    }
  });

  it("gives a way to reach TeacherAid, and the terms carry the three rules of fair use", () => {
    expect(CONTACT_EMAIL).toMatch(/^[^@\s]+@[^@\s]+\.[a-z]+$/);
    const en = TERMS.en.sections.map((s) => s.id);
    expect(en).toEqual(expect.arrayContaining(["yourself", "respect", "qr"]));
  });

  it("is written in the student's own language: Macedonian for mk, no Cyrillic in en but the law's name", () => {
    const cyrillic = /\p{Script=Cyrillic}/u;
    for (const docs of [PRIVACY, TERMS]) {
      for (const text of texts(docs.mk)) expect(text, text).toMatch(cyrillic);
      for (const text of texts(docs.en)) expect(text.replace("ЗЗЛП", ""), text).not.toMatch(cyrillic);
    }
  });
});

/** Every key a screen for this step added, in both languages. */
const NEW_KEYS = (Object.keys(dictionaries.en) as Key[]).filter((k) => /^(privacy|terms|data|notice)\./.test(k) || k === "settings.privacy" || k.startsWith("settings.demo."));

describe("text hygiene of the new words", () => {
  const everything = [
    ...LOCALES.flatMap((l) => NEW_KEYS.map((k) => [`${l} ${k}`, dictionaries[l][k]] as const)),
    ...[PRIVACY, TERMS].flatMap((docs) =>
      LOCALES.flatMap((l) => [[`${l} title`, docs[l].title] as const, ...texts(docs[l]).map((t) => [`${l} ${t.slice(0, 24)}`, t] as const)]),
    ),
  ];

  it("has strings to check", () => {
    expect(NEW_KEYS.length).toBeGreaterThan(40);
    expect(everything.length).toBeGreaterThan(150);
  });

  it("has no invisible characters or exotic spaces", () => {
    // Soft hyphen, zero-width and direction marks, line and paragraph separators, narrow and word-joiner spaces, the BOM, a no-break space.
    const bad = new Set([0xad, 0x200b, 0x200c, 0x200d, 0x200e, 0x200f, 0x2028, 0x2029, 0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x202f, 0x2060, 0x2061, 0x2062, 0x2063, 0x2064, 0xfeff, 0xa0]);
    for (const [where, text] of everything) expect([...text].filter((ch) => bad.has(ch.codePointAt(0)!)), where).toEqual([]);
  });

  it("has no word that mixes Cyrillic and Latin letters", () => {
    for (const [where, text] of everything) {
      for (const word of text.match(/[\p{L}]+/gu) ?? []) {
        const mixed = /\p{Script=Cyrillic}/u.test(word) && /\p{Script=Latin}/u.test(word);
        expect(mixed, `${where}: ${word}`).toBe(false);
      }
    }
  });

  it("keeps the two languages' placeholders the same", () => {
    const names = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const key of NEW_KEYS) expect(names(dictionaries.mk[key]), key).toEqual(names(dictionaries.en[key]));
  });
});
