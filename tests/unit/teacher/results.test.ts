import { describe, expect, test } from "vitest";
import { registerName, resultRows, resultsText, sortRegister } from "@/lib/teacher/results";

const words = { score: (correct: number, asked: number) => `${correct} од ${asked}` };

describe("the end page's list", () => {
  test("writes a student surname first, and in Latin letters in English (EC-NAME-01)", () => {
    expect(registerName("Ана Петровска", "mk")).toBe("Петровска Ана");
    expect(registerName("Ана Петровска", "en")).toBe("Petrovska Ana");
  });

  test("keeps the register's order: surname, then name, in the Macedonian alphabet", () => {
    const names = ["Борис Ѓорѓиев", "Ана Дамјанова", "Виктор Арсов", "Благица Арсов"].map((full_name) => ({ full_name }));
    expect(sortRegister(names).map((n) => n.full_name)).toEqual(["Благица Арсов", "Виктор Арсов", "Ана Дамјанова", "Борис Ѓорѓиев"]);
  });

  test("scores each student on the questions put to them: sent after they joined", () => {
    const rows = resultRows(
      [
        { student_id: "a", full_name: "Ана Арсова", joined_at: 100 },
        { student_id: "b", full_name: "Борис Бојков", joined_at: 250 },
      ],
      [
        { fired_at: 200, right: new Set(["a", "b"]) },
        { fired_at: 300, right: new Set(["a"]) },
        { fired_at: 400, right: new Set(["b"]) },
      ],
    );
    // The first question was sent before Борис joined: it was not put to him, so it is neither right nor wrong for him.
    expect(rows).toEqual([
      { student_id: "a", full_name: "Ана Арсова", correct: 2, asked: 3 },
      { student_id: "b", full_name: "Борис Бојков", correct: 1, asked: 2 },
    ]);
  });

  test("a student who joined and was put no question has 0 of 0, and a lesson with none puts none to anybody", () => {
    expect(resultRows([{ student_id: "a", full_name: "Ана Арсова", joined_at: 500 }], [{ fired_at: 100, right: new Set(["a"]) }])).toEqual([
      { student_id: "a", full_name: "Ана Арсова", correct: 0, asked: 0 },
    ]);
    expect(resultRows([{ student_id: "a", full_name: "Ана Арсова", joined_at: 0 }], [])).toEqual([{ student_id: "a", full_name: "Ана Арсова", correct: 0, asked: 0 }]);
  });

  test("copies one line a student, the register name, a tab and the score, in the register's order", () => {
    const rows = [
      { student_id: "b", full_name: "Борис Бојков", correct: 1, asked: 2 },
      { student_id: "a", full_name: "Ана Арсова", correct: 4, asked: 6 },
    ];
    expect(resultsText(rows, "mk", words)).toBe("Арсова Ана\t4 од 6\nБојков Борис\t1 од 2");
    expect(resultsText([], "mk", words)).toBe("");
  });
});
