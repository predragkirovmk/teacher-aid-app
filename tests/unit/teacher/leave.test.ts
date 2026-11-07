import { describe, expect, test } from "vitest";
import { leavesTo } from "@/lib/teacher/leave";

const HERE = "https://app.example/teacher/lessons/new?from=today";

describe("which clicks leave the page that is waiting", () => {
  test("a link to another page of the app leaves, and is followed as written", () => {
    expect(leavesTo("/teacher", HERE)).toBe("/teacher");
    expect(leavesTo("https://app.example/teacher/settings", HERE)).toBe("/teacher/settings");
    expect(leavesTo("/teacher/lessons?x=1#top", HERE)).toBe("/teacher/lessons?x=1#top");
  });

  test("a link to the page itself, or to a place on it, does not leave", () => {
    expect(leavesTo("#main", HERE)).toBeNull();
    expect(leavesTo("/teacher/lessons/new?from=today#main", HERE)).toBeNull();
    expect(leavesTo(HERE, HERE)).toBeNull();
  });

  test("the same page with another query is another page", () => {
    expect(leavesTo("/teacher/lessons/new", HERE)).toBe("/teacher/lessons/new");
  });

  test("a link to another site is the browser's to ask about, not ours", () => {
    expect(leavesTo("https://example.org/", HERE)).toBeNull();
    expect(leavesTo("mailto:hello@teacheraid.education", HERE)).toBeNull();
  });

  test("an address that cannot be read is left alone", () => {
    expect(leavesTo("/teacher", "not a url")).toBeNull();
    expect(leavesTo("http://[", HERE)).toBeNull();
  });
});
