import { describe, expect, test } from "vitest";
import type { AttendanceRow, MissedQuestion } from "@/lib/teacher/api/types";
import { attendanceLine, attendanceText, registerName, sortAttendance, splitName, tallyOf, type AttendanceWords } from "@/lib/teacher/attendance";
import { ANON_PER_SCREEN, clampScreen, correctWords, rankMissed, REVIEW_MISSED_MAX, reviewScreens } from "@/lib/teacher/review";
import { countMissed, PRACTICE_MAX, PRACTICE_MIN, PRACTICE_MISS_SHARE, selectPracticeQuestions } from "@/lib/teacher/scoring";

const m = (id: string, order: number, missed: number, joined = 20, extra: Partial<MissedQuestion> = {}): MissedQuestion => ({
  session_question_id: id,
  order,
  prompt: id,
  kind: "true_false",
  topic: "t",
  missed,
  joined,
  correct_answer: "true",
  explanation: null,
  options: null,
  unit: null,
  ...extra,
});

describe("the ranking", () => {
  test("worst first by share, then number, then the earlier question; a question nobody missed is not in it", () => {
    const ranked = rankMissed([m("a", 0, 5, 20), m("b", 1, 10, 20), m("c", 2, 5, 10), m("d", 3, 0), m("e", 4, 10, 20)]);
    expect(ranked.map((x) => x.session_question_id)).toEqual(["b", "e", "c", "a"]);
  });
});

describe("the practice set and the late joiner", () => {
  test("a student who joined after the question was sent is on neither side of the share", () => {
    const results = [
      { joined_at: 0, right: true },
      { joined_at: 0, right: false },
      { joined_at: 500, right: false },
      { joined_at: null, right: false },
    ];
    expect(countMissed(1000, results)).toEqual({ missed: 2, joined: 3 });
    expect(countMissed(100, results)).toEqual({ missed: 1, joined: 2 });
    expect(countMissed(400, [{ joined_at: 500, right: false }])).toEqual({ missed: 0, joined: 0 });
  });

  test("so a question that only late joiners got wrong does not reach the set", () => {
    // Out of 10 on time, 3 missed (30 %, under the share); 8 late joiners would have made it 11 of 18 (61 %) had they been counted.
    const on_time = Array.from({ length: 10 }, (_, i) => ({ joined_at: 0, right: i >= 3 }));
    const late = Array.from({ length: 8 }, () => ({ joined_at: 9000, right: false }));
    const { missed, joined } = countMissed(1000, [...on_time, ...late]);
    expect(missed / joined).toBeLessThan(PRACTICE_MISS_SHARE);
    expect(selectPracticeQuestions([{ id: "q", order: 0, skipped: false, joined, missed }])).toEqual(["q"]);
    // Alone it is the next most missed, added to reach the minimum; a second one below it does not push it out.
    expect(selectPracticeQuestions([{ id: "q", order: 0, skipped: false, joined, missed }, { id: "r", order: 1, skipped: false, joined: 10, missed: 5 }])).toEqual(["q", "r"]);
  });

  test("skipped questions never, quick questions like any other, and nothing missed means no set", () => {
    const quick = { id: "adhoc", order: 7, skipped: false, joined: 20, missed: 12 };
    expect(selectPracticeQuestions([{ id: "s", order: 0, skipped: true, joined: 20, missed: 20 }, quick, { id: "q", order: 1, skipped: false, joined: 20, missed: 9 }])).toEqual(["q", "adhoc"]);
    expect(selectPracticeQuestions([{ id: "q", order: 0, skipped: false, joined: 20, missed: 0 }])).toEqual([]);
    expect(PRACTICE_MISS_SHARE).toBe(0.4);
    expect(PRACTICE_MIN).toBe(2);
    expect(PRACTICE_MAX).toBe(8);
  });
});

describe("the screens of the review", () => {
  const anon = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `a${i}`, text: `Прашање ${i}` }));

  test("one most-missed question a screen, the five worst, then the anonymous questions a few at a time", () => {
    const missed = Array.from({ length: 7 }, (_, i) => m(`q${i}`, i, 10 - i));
    const screens = reviewScreens(missed, anon(ANON_PER_SCREEN + 1));
    expect(screens.map((s) => s.kind)).toEqual([...Array(REVIEW_MISSED_MAX).fill("missed"), "anon", "anon"]);
    expect(screens[0]).toMatchObject({ kind: "missed", n: 1, of: REVIEW_MISSED_MAX });
    expect(screens.at(-1)).toMatchObject({ kind: "anon", from: ANON_PER_SCREEN + 1, to: ANON_PER_SCREEN + 1, of: ANON_PER_SCREEN + 1 });
  });

  test("nothing missed and no questions is one honest screen; questions without a miss follow it", () => {
    expect(reviewScreens([], [])).toEqual([{ kind: "none_missed" }]);
    expect(reviewScreens([], anon(1)).map((s) => s.kind)).toEqual(["none_missed", "anon"]);
  });

  test("the text of an anonymous question travels without anything else", () => {
    const withSender = [{ id: "a", text: "x", sender: { id: "s", name: "Ана" } }];
    const screen = reviewScreens([], withSender)[1];
    expect(JSON.stringify(screen)).not.toContain("Ана");
  });

  test("a position is kept inside the screens that exist", () => {
    const screens = reviewScreens([], []);
    expect(clampScreen(5, screens)).toBe(0);
    expect(clampScreen(-2, reviewScreens([m("a", 0, 3)], anon(4)))).toBe(0);
    expect(clampScreen(NaN, screens)).toBe(0);
  });

  test("the right answer is said in words", () => {
    const labels = { true: "Точно", false: "Неточно" };
    expect(correctWords({ kind: "true_false", correct_answer: "false", options: null, unit: null }, labels)).toBe("Неточно");
    expect(correctWords({ kind: "multiple_choice", correct_answer: "1", options: ["Реку", "Море"], unit: null }, labels)).toBe("B. Море");
    expect(correctWords({ kind: "numeric", correct_answer: "12.5", options: null, unit: "cm" }, labels)).toBe("12,5 cm");
  });
});

const row = (id: string, name: string, status: AttendanceRow["status"], reason: AttendanceRow["no_device_reason"] = null): AttendanceRow => ({
  student_id: id,
  full_name: name,
  status,
  joined_at: null,
  no_device_reason: reason,
  marked_by: "system",
});

const words: AttendanceWords = {
  status: { present: "присутен/а", late: "задоцнет/а", absent: "отсутен/а", present_no_device: "присутен/а без телефон" },
  reason: { no_phone: "Нема телефон", battery: "Празна батерија", no_data: "Нема интернет", no_focus_authorization: "Нема дозвола" },
};

describe("the attendance list", () => {
  test("names are given name first and surname last", () => {
    expect(splitName("Ана Мария Петровска")).toEqual({ surname: "Петровска", given: "Ана Мария" });
    expect(splitName("Мадона")).toEqual({ surname: "Мадона", given: "" });
    expect(registerName("Ана Петровска", "mk")).toBe("Петровска Ана");
    expect(registerName("Ана Петровска", "en")).toBe("Petrovska Ana");
  });

  test("the register's order: surname, then name, in the Macedonian alphabet (ѓ after г, ч after ц)", () => {
    const rows = [row("1", "Марко Чавдар", "present"), row("2", "Ана Цветковска", "present"), row("3", "Тони Ѓорѓиев", "present"), row("4", "Ема Георгиева", "present"), row("5", "Вера Георгиева", "present"), row("6", "Мила Аврамовска", "present")];
    expect(sortAttendance(rows).map((r) => r.student_id)).toEqual(["6", "5", "4", "3", "2", "1"]);
  });

  test("one student a line: name, a colon, the status in words, and the reason in brackets for no phone", () => {
    expect(attendanceLine(row("1", "Ана Петровска", "late"), words, "mk")).toBe("Петровска Ана: задоцнет/а");
    expect(attendanceLine(row("2", "Бојан Атанасовски", "present_no_device", "battery"), words, "mk")).toBe("Атанасовски Бојан: присутен/а без телефон (празна батерија)");
    const text = attendanceText([row("1", "Ана Петровска", "present"), row("2", "Бојан Атанасовски", "absent")], words, "mk");
    expect(text).toBe("Атанасовски Бојан: отсутен/а\nПетровска Ана: присутен/а");
  });

  test("the counts come from the rows", () => {
    expect(tallyOf([row("1", "А Б", "present"), row("2", "В Г", "absent"), row("3", "Д Е", "absent")])).toEqual({ present: 1, late: 0, absent: 2, present_no_device: 0, total: 3 });
  });
});
