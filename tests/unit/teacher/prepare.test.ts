import { describe, expect, test } from "vitest";
import { ApiError, VALIDATION_REASONS } from "@/lib/teacher/api/errors";
import { dictionaries, translate, type Key } from "@/lib/teacher/i18n";
import { EMPHASIS_MAX_CHARS, LESSON_UPLOAD_MAX_BYTES, TYPED_TEXT_MAX_CHARS, TYPED_TEXT_MIN_CHARS } from "@/lib/teacher/lessons";
import {
  checkFile,
  checkForm,
  checkText,
  emphasisOf,
  failureOf,
  fileSize,
  focusKeyOf,
  hasProblems,
  hasWork,
  isFormMemory,
  isRefill,
  materialProblemOf,
  refillOf,
  REQUEST_LIMIT_MS,
  showsEmphasisCount,
  sourceToKeep,
  STILL_WORKING_MS,
  WAIT_LIMIT_MS,
  type FormInput,
} from "@/lib/teacher/prepare";

describe("a document, judged before it is sent (BR-LES-05)", () => {
  test("a PDF or a Word (.docx) file is taken, whatever the case of its name", () => {
    expect(checkFile({ name: "план.pdf", size: 1000 })).toBeNull();
    expect(checkFile({ name: "План.DOCX", size: 1000 })).toBeNull();
    expect(checkFile({ name: "a.b.c.pdf", size: 1 })).toBeNull();
  });

  test("anything else is the wrong type, the old .doc too", () => {
    for (const name of ["план.doc", "слика.png", "табела.xlsx", "pdf", "план.pdf.exe", ""]) expect(checkFile({ name, size: 1000 }), name).toBe("file_type");
  });

  test("an empty file is empty, and one over 20 MB is too large; 20 MB itself is fine", () => {
    expect(checkFile({ name: "празен.pdf", size: 0 })).toBe("empty");
    expect(checkFile({ name: "голем.pdf", size: LESSON_UPLOAD_MAX_BYTES })).toBeNull();
    expect(checkFile({ name: "голем.pdf", size: LESSON_UPLOAD_MAX_BYTES + 1 })).toBe("file_too_large");
  });

  test("the type is judged first: a picture that is empty is not a PDF", () => {
    expect(checkFile({ name: "празна.png", size: 0 })).toBe("file_type");
  });
});

describe("typed sentences, judged before they are sent (BR-LES-06)", () => {
  test("nothing, and only spaces, is none", () => {
    expect(checkText("")).toBe("text_none");
    expect(checkText("   \n  ")).toBe("text_none");
  });

  test("fewer than 40 characters is too short, 40 is enough, and spaces around do not count", () => {
    expect(checkText("x".repeat(TYPED_TEXT_MIN_CHARS - 1))).toBe("text_too_short");
    expect(checkText("x".repeat(TYPED_TEXT_MIN_CHARS))).toBeNull();
    expect(checkText(`  ${"x".repeat(TYPED_TEXT_MIN_CHARS - 1)}  `)).toBe("text_too_short");
    expect(checkText(`  ${"x".repeat(TYPED_TEXT_MIN_CHARS)}  `)).toBeNull();
  });
});

describe("the whole form", () => {
  const good: FormInput = { kind: "typed", file: null, text: "x".repeat(60) };

  test("a form with everything in it has no problems", () => {
    expect(checkForm(good)).toEqual({});
    expect(checkForm({ ...good, kind: "file", file: { name: "план.pdf", size: 10 }, text: "" })).toEqual({});
  });

  test("nothing chosen asks for how the material is added", () => {
    expect(checkForm({ kind: null, file: null, text: "" })).toEqual({ material: "pick" });
  });

  test("the document kind with no document says so; with a wrong one it says what is wrong", () => {
    expect(checkForm({ ...good, kind: "file" })).toEqual({ material: "no_file" });
    expect(checkForm({ ...good, kind: "file", file: { name: "план.doc", size: 10 } })).toEqual({ material: "file_type" });
    expect(checkForm({ ...good, kind: "file", file: { name: "план.pdf", size: 0 } })).toEqual({ material: "empty" });
    expect(checkForm({ ...good, kind: "file", file: { name: "план.pdf", size: LESSON_UPLOAD_MAX_BYTES + 1 } })).toEqual({ material: "file_too_large" });
  });

  test("a document left over from before the teacher chose to type is not looked at", () => {
    expect(checkForm({ ...good, kind: "typed", file: { name: "план.doc", size: 10 } })).toEqual({});
  });

  test("typed sentences that are missing or short say so", () => {
    expect(checkForm({ ...good, text: "" })).toEqual({ material: "text_none" });
    expect(checkForm({ ...good, text: "Кратко." })).toEqual({ material: "text_too_short" });
  });

  test("any problem is a problem, and the focus goes to the control that fixes it", () => {
    expect(hasProblems({})).toBe(false);
    expect(hasProblems({ material: "no_file" })).toBe(true);
    expect(focusKeyOf({ material: "pick" }, null)).toBe("kind");
    expect(focusKeyOf({ material: "no_file" }, "file")).toBe("file");
    expect(focusKeyOf({ material: "no_text" }, "file")).toBe("file");
    expect(focusKeyOf({ material: "text_too_short" }, "typed")).toBe("text");
  });
});

describe("a refusal of the material, said at part 1 (EC-LES-06, EC-LES-07)", () => {
  const refused = (reason?: (typeof VALIDATION_REASONS)[number]) => new ApiError("validation_failed", { status: 422, reason });

  test("every reason the API gives is its own problem", () => {
    for (const reason of VALIDATION_REASONS) expect(materialProblemOf(refused(reason))).toBe(reason);
  });

  test("every reason has its own words, in both languages", () => {
    for (const reason of VALIDATION_REASONS) {
      for (const locale of ["mk", "en"] as const) {
        expect(dictionaries[locale][`prepare.problem.${reason}.title` as Key], `${locale} ${reason} title`).toBeTruthy();
        expect(dictionaries[locale][`prepare.problem.${reason}.body` as Key], `${locale} ${reason} body`).toBeTruthy();
      }
    }
  });

  test("a refusal with no reason is a problem the form has no sentence for; anything else is not a refusal of the material", () => {
    expect(materialProblemOf(refused())).toBe("other");
    expect(materialProblemOf(new ApiError("network"))).toBeNull();
    expect(materialProblemOf(new ApiError("generation_failed"))).toBeNull();
    expect(materialProblemOf(new Error("x"))).toBeNull();
    expect(materialProblemOf(null)).toBeNull();
  });
});

describe("what the teacher would have to do again (leaving the form asks first)", () => {
  const empty = { file: null, text: "", emphasis: "" };

  test("a form with nothing typed or chosen as a document holds no work, however a way to add the material was picked", () => {
    expect(hasWork(empty)).toBe(false);
    expect(hasWork({ ...empty, text: "   \n " })).toBe(false);
    expect(hasWork({ ...empty, emphasis: "  " })).toBe(false);
  });

  test("sentences, a document, or only the sentence of emphasis are work", () => {
    expect(hasWork({ ...empty, text: "Равенки" })).toBe(true);
    expect(hasWork({ ...empty, file: { name: "план.pdf" } })).toBe(true);
    expect(hasWork({ ...empty, emphasis: "Повеќе примери." })).toBe(true);
  });
});

describe("the sentence of emphasis (BR-LES-07)", () => {
  test("it is sent trimmed and cut at 200 characters, or not at all", () => {
    expect(emphasisOf("  Повеќе примери.  ")).toBe("Повеќе примери.");
    expect(emphasisOf("   ")).toBeNull();
    expect(emphasisOf("")).toBeNull();
    expect(emphasisOf("x".repeat(250))).toHaveLength(EMPHASIS_MAX_CHARS);
  });

  test("its count shows only near the limit", () => {
    expect(showsEmphasisCount(0)).toBe(false);
    expect(showsEmphasisCount(100)).toBe(false);
    expect(showsEmphasisCount(159)).toBe(false);
    expect(showsEmphasisCount(160)).toBe(true);
    expect(showsEmphasisCount(EMPHASIS_MAX_CHARS)).toBe(true);
  });
});

describe("a file's size in words", () => {
  test("kilobytes below a megabyte, megabytes with a comma in Macedonian", () => {
    expect(fileSize(0, "mk")).toBe("0 KB");
    expect(fileSize(300, "mk")).toBe("1 KB");
    expect(fileSize(240 * 1024, "mk")).toBe("240 KB");
    expect(fileSize(1.5 * 1024 * 1024, "mk")).toBe("1,5 MB");
    expect(fileSize(1.5 * 1024 * 1024, "en")).toBe("1.5 MB");
    expect(fileSize(20 * 1024 * 1024, "en")).toBe("20 MB");
  });
});

describe("the wait", () => {
  test("it gives up at 3 minutes (BR-LES-09) and says it is still working at 20 seconds", () => {
    expect(WAIT_LIMIT_MS).toBe(180_000);
    expect(STILL_WORKING_MS).toBe(20_000);
  });

  test("the failure is told by why the screen stopped waiting first, then by what the API said", () => {
    expect(failureOf(new ApiError("network"), "timeout")).toBe("timeout");
    expect(failureOf(new ApiError("network"), "offline")).toBe("offline");
    expect(failureOf(new ApiError("network"), null)).toBe("offline");
    expect(failureOf(new ApiError("generation_failed", { status: 502 }), null)).toBe("generation");
    expect(failureOf(new ApiError("server_error", { status: 500 }), null)).toBe("other");
    expect(failureOf(new ApiError("validation_failed", { status: 422 }), null)).toBe("other");
    expect(failureOf(new Error("x"), null)).toBe("other");
  });

  test("a retry keeps the source it has, unless the API no longer knows it", () => {
    expect(sourceToKeep("src-1", new ApiError("generation_failed"))).toBe("src-1");
    expect(sourceToKeep("src-1", new ApiError("network"))).toBe("src-1");
    expect(sourceToKeep("src-1", new ApiError("not_found", { status: 404 }))).toBeNull();
    expect(sourceToKeep(null, new ApiError("network"))).toBeNull();
  });
});

describe("the words of the page", () => {
  test("every key of the page and the draft is in both languages and the numbers in them are the rules' numbers", () => {
    const keys = (Object.keys(dictionaries.en) as Key[]).filter((k) => k.startsWith("prepare.") || k.startsWith("draft."));
    expect(keys.length).toBeGreaterThan(40);
    for (const key of keys) expect(dictionaries.mk[key], key).toBeTruthy();
    for (const locale of ["mk", "en"] as const) {
      expect(translate(locale, "school", "prepare.typed.hint")).toContain(String(TYPED_TEXT_MIN_CHARS));
      expect(translate(locale, "school", "prepare.problem.text_too_short.body")).toContain(String(TYPED_TEXT_MIN_CHARS));
      expect(translate(locale, "school", "prepare.file.rules")).toContain(String(LESSON_UPLOAD_MAX_BYTES / 1024 / 1024));
      expect(translate(locale, "school", "prepare.problem.file_too_large.body")).toContain(String(LESSON_UPLOAD_MAX_BYTES / 1024 / 1024));
      expect(translate(locale, "school", "prepare.emphasis.count", { n: 170 })).toContain(String(EMPHASIS_MAX_CHARS));
      expect(translate(locale, "school", "prepare.emphasis.max")).toContain(String(EMPHASIS_MAX_CHARS));
    }
  });

  test("the second part says it is optional once, the wait says it may be left, and the failure's second button does not say Back", () => {
    for (const locale of ["mk", "en"] as const) {
      expect(translate(locale, "school", "prepare.emphasis.hint")).not.toMatch(/не мора|do not have to/i);
      expect(translate(locale, "school", "prepare.fail.change")).not.toBe(translate(locale, "school", "back"));
      // Leaving the wait loses nothing now, and the wait says so.
      expect(translate(locale, "school", "prepare.wait.time")).not.toMatch(/Оставете ја оваа страница отворена|Please keep this page open/);
    }
    expect(translate("mk", "school", "prepare.optional")).toBe("По желба");
  });

  test("the page is worded for a faculty too: students", () => {
    expect(translate("mk", "school", "prepare.file.privacy")).toContain("ученици");
    expect(translate("mk", "university", "prepare.file.privacy")).toContain("студенти");
    expect(translate("en", "university", "prepare.go.note")).toContain("students");
  });
});

describe("typed sentences have a most (BR-LES-14)", () => {
  test("20 000 characters are taken after the spaces at both ends are cut, and one more is not", () => {
    expect(TYPED_TEXT_MAX_CHARS).toBe(20_000);
    expect(checkText("а".repeat(20_000))).toBeNull();
    expect(checkText(`  ${"а".repeat(20_000)}  `)).toBeNull();
    expect(checkText("а".repeat(20_001))).toBe("text_too_long");
    expect(checkText("а".repeat(TYPED_TEXT_MIN_CHARS - 1))).toBe("text_too_short");
  });

  test("the API's reason is the form's own sentence at the box, and the words are in both languages", () => {
    expect(materialProblemOf(new ApiError("validation_failed", { reason: "text_too_long" }))).toBe("text_too_long");
    for (const locale of ["mk", "en"] as const) {
      expect(translate(locale, "school", "prepare.problem.text_too_long.body")).toMatch(/20[ ,]000/);
      expect(translate(locale, "school", "prepare.typed.max")).toMatch(/20[ ,]000/);
    }
    expect(checkForm({ kind: "typed", file: null, text: "а".repeat(20_001) })).toEqual({ material: "text_too_long" });
  });

  test("the call that asks for the questions answers at once, so it has the short limit, not the document's", () => {
    expect(REQUEST_LIMIT_MS).toBe(15_000);
    expect(REQUEST_LIMIT_MS).toBeLessThan(WAIT_LIMIT_MS);
  });
});

describe("cancelling the wait gives the form back (F-03)", () => {
  const draft = (patch: Record<string, unknown> = {}) => ({
    id: "d3",
    emphasis: "Повеќе примери." as string | null,
    source_id: "src-n1" as string | null,
    source: { kind: "typed" as "typed" | "upload", file_name: null as string | null },
    ...patch,
  });

  test("typed sentences come back from what the form kept for this draft, with the emphasis", () => {
    const refill = refillOf(draft(), { draft_id: "d3", text: "Моите реченици.", file_size: null });
    expect(refill).toEqual({ emphasis: "Повеќе примери.", kind: "typed", text: "Моите реченици.", document: null, note: "cancelled" });
    // Back from a failure says that what was entered is kept, not that anything was cancelled.
    expect(refillOf(draft(), null, "kept").note).toBe("kept");
  });

  test("what the form kept for another draft is not given back", () => {
    expect(refillOf(draft(), { draft_id: "d9", text: "Туѓи реченици.", file_size: null }).text).toBe("");
    expect(refillOf(draft(), null)).toMatchObject({ kind: "typed", text: "", emphasis: "Повеќе примери." });
  });

  test("a document comes back by its name and its source, to be used again and not sent again; its size if the form kept it", () => {
    const upload = draft({ source: { kind: "upload", file_name: "Логаритми.docx" }, emphasis: null });
    expect(refillOf(upload, { draft_id: "d3", text: "", file_size: 2048 })).toEqual({
      emphasis: "",
      kind: "file",
      text: "",
      document: { name: "Логаритми.docx", size: 2048, source_id: "src-n1" },
      note: "cancelled",
    });
    expect(refillOf(upload, null).document).toEqual({ name: "Логаритми.docx", size: null, source_id: "src-n1" });
  });

  test("a draft with no source gives back no kind", () => {
    expect(refillOf(draft({ source: null, source_id: null }), null)).toMatchObject({ kind: null, document: null });
  });

  test("what is read back from the tab is trusted only if it has the shape", () => {
    const good = refillOf(draft(), null);
    expect(isRefill(good)).toBe(true);
    expect(isRefill({ ...good, emphasis: 2 })).toBe(false);
    expect(isRefill({ ...good, kind: "pdf" })).toBe(false);
    expect(isRefill({ ...good, note: "other" })).toBe(false);
    expect(isRefill({ ...good, document: { name: 4 } })).toBe(false);
    expect(isRefill(null)).toBe(false);
    expect(isFormMemory({ draft_id: "d3", text: "т", file_size: null })).toBe(true);
    expect(isFormMemory({ draft_id: 3, text: "т", file_size: null })).toBe(false);
    expect(isFormMemory("text")).toBe(false);
  });

  test("a document the form held from before is work too: leaving would lose it", () => {
    expect(hasWork({ file: { name: "Логаритми.docx", size: null }, text: "", emphasis: "" })).toBe(true);
  });
});
