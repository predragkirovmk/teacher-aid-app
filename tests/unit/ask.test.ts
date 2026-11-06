import { describe, expect, it } from "vitest";
import type { StudentStage } from "@/lib/app/api/types";
import { ANON_LIMIT, ANON_MAX_LENGTH, askRemaining, canAsk, cleanAsk } from "@/lib/app/session/ask";

describe("cleanAsk", () => {
  it("trims, and collapses white space and line breaks to single spaces", () => {
    expect(cleanAsk("  Why is   x\n\n equal to 2?  ")).toBe("Why is x equal to 2?");
  });

  it("is empty for white space, which is nothing to send", () => {
    expect(cleanAsk(" \n\t ")).toBe("");
  });

  it("cuts at the limit counting characters as the student sees them, not code units", () => {
    const long = "ш".repeat(ANON_MAX_LENGTH + 40);
    expect(Array.from(cleanAsk(long)).length).toBe(ANON_MAX_LENGTH);
    // An emoji is one character, and is never cut in half.
    const emoji = "😀".repeat(ANON_MAX_LENGTH + 5);
    expect(Array.from(cleanAsk(emoji)).length).toBe(ANON_MAX_LENGTH);
    expect(cleanAsk(emoji).includes("�")).toBe(false);
  });

  it("takes a limit of its own", () => {
    expect(cleanAsk("abcdef", 3)).toBe("abc");
  });
});

describe("the limit", () => {
  it("is 3 a lesson (BR-ANON-02)", () => {
    expect(ANON_LIMIT).toBe(3);
  });

  it("leaves what is not used or waiting to be sent", () => {
    expect(askRemaining({ used: 1, limit: 3 }, 0)).toBe(2);
    // A question saved on the phone will count: it is not free to spend again.
    expect(askRemaining({ used: 1, limit: 3 }, 1)).toBe(1);
    expect(askRemaining({ used: 3, limit: 3 }, 0)).toBe(0);
    expect(askRemaining({ used: 2, limit: 3 }, 4)).toBe(0);
  });

  it("is unknown when the server has not said", () => {
    expect(askRemaining(null, 0)).toBeNull();
  });
});

describe("where the way to ask is shown", () => {
  const ALL: StudentStage[] = [
    "syncing",
    "waiting_start",
    "answering",
    "waiting_others",
    "waiting_result",
    "right",
    "wrong",
    "waiting_next",
    "ended",
  ];

  it("is on the screens where nothing is asked of the student", () => {
    expect(ALL.filter(canAsk).sort()).toEqual(["waiting_next", "waiting_start"]);
  });

  it("is never on a screen where a question is open, answered or not", () => {
    for (const stage of ["answering", "waiting_others", "waiting_result"] as const) {
      expect(canAsk(stage), stage).toBe(false);
    }
  });
});
