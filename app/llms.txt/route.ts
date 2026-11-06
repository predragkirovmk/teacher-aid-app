import { siteUrl } from "@/lib/site-v2/url";
import { en } from "@/content/site-v2/en";
import { mk } from "@/content/site-v2/mk";
import { chrome, homePaths, pageOrder, pagePaths, pages } from "@/content/site-v2/pages";
import type { Lang } from "@/content/site-v2/types";

export const dynamic = "force-static";

/*
  /llms.txt: the site in one Markdown file for language models (llmstxt.org). Google Search
  ignores it and no AI search engine has confirmed reading it; it is here because it costs
  nothing and some agents do fetch it. Built from the same content as the pages, so it cannot
  drift from them.
*/
const url = (path: string) => (path === "/" ? `${siteUrl}/` : `${siteUrl}${path}`);
const home = { mk, en };

function pageLinks(lang: Lang): string[] {
  return [
    `- [${home[lang].meta.title}](${url(homePaths[lang])}): ${home[lang].meta.description}`,
    ...pageOrder.map((key) => {
      const p = pages[key][lang];
      return `- [${p.meta.title}](${url(pagePaths[key][lang])}): ${p.meta.description}`;
    }),
  ];
}

export function GET() {
  const body = [
    "# TeacherAid",
    "",
    `> ${chrome.en.definition}`,
    "",
    chrome.mk.definition,
    "",
    "Key facts:",
    "",
    "- Made by a small team in Bitola, North Macedonia. Started at Startup Weekend Bitola, 11 to 13 September 2026.",
    "- For teachers and directors of secondary schools, and professors and deans at universities. Everything is in Macedonian.",
    "- The teacher adds a lesson (PDF, Word or a few sentences); TeacherAid prepares five to eight questions with right answers and explanations. Nothing reaches students until the teacher has checked it.",
    "- Students answer on their own phones in the browser, signed in with their school Google or Microsoft account. Attendance is one scan of a QR code that changes every 30 seconds.",
    "- At the end of class the teacher gets the list of present, late and absent students, ready to copy into e-Dnevnik (the national class register). TeacherAid never writes to e-Dnevnik.",
    "- Every month the director gets a PDF report with totals and no student names.",
    "- The data belongs to the school, is processed under North Macedonia's Law on Personal Data Protection, and stays in the EU. Student names are never sent to the AI.",
    "- The first schools start in the 2026/27 school year. The first lesson in a school is free. Contact: hello@teacheraid.education.",
    "- Not to be confused with TeachAid, Teacher Aide or Teacher Aide Pro, which are unrelated products.",
    "",
    "## Pages in Macedonian",
    "",
    ...pageLinks("mk"),
    "",
    "## Pages in English",
    "",
    ...pageLinks("en"),
    "",
  ].join("\n");
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
