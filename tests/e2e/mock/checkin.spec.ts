import { expect, mk, test } from "../fixtures";
import type { Page } from "@playwright/test";

test("a check-in link records attendance and opens the quiz", async ({ page }) => {
  await page.goto("/app/checkin/MATH-7B");

  // The link hands over to the quiz, whose lobby is the first thing the student sees.
  await expect(page).toHaveURL(/\/app\/play\/MATH-7B$/);
  await expect(page.getByText(mk.q("q.live"))).toBeVisible();
  await expect(page.getByText(mk.t("subj.math"), { exact: true }).first()).toBeVisible();

  // Joining is the attendance: 21 of 24, up from 20 of 23.
  await page.goto("/app");
  await expect(page.getByRole("link", { name: new RegExp(mk.t("home.attendance")) })).toContainText("88%");

  await page.goto("/app/attendance");
  await expect(page.getByText(mk.t("subj.math")).first()).toBeVisible();
});

test("checking in twice is one attendance", async ({ page }) => {
  await page.goto("/app/checkin/MATH-7B");
  await expect(page).toHaveURL(/\/app\/play\/MATH-7B$/);
  await page.goto("/app/checkin/math-7b");
  await expect(page).toHaveURL(/\/app\/play\/math-7b$/);
  await expect(page.getByText(mk.q("q.live"))).toBeVisible();

  await page.goto("/app");
  await expect(page.getByRole("link", { name: new RegExp(mk.t("home.attendance")) })).toContainText("88%");
});

test("checking in earns no points", async ({ page }) => {
  await page.goto("/app/checkin/MATH-7B");
  await expect(page.getByText(mk.q("q.live"))).toBeVisible();
  await page.goto("/app/leaderboard");
  await expect(page.locator(".item--me")).toContainText(/1\D?310/);
});

/**
 * Every reason a join can fail has a screen of its own (EC-JOIN-01, -02, -07). The mock answers to special
 * codes (lib/app/api/mock/session.ts), so each one has a link a person can open.
 */
test.describe("when the join fails", () => {
  const screen = (page: Page, kind: string) => page.locator(`main[data-failure="${kind}"]`);
  const nothingRecorded = async (page: Page) => {
    await page.goto("/app");
    await expect(page.getByRole("link", { name: new RegExp(mk.t("home.attendance")) })).toContainText("87%");
  };

  test("an expired code says so, and offers to scan the new one", async ({ page }) => {
    await page.goto("/app/checkin/EXPIRED-7B");
    const s = screen(page, "expired");
    await expect(s.getByRole("alert")).toContainText(mk.q("q.fail.expired.title"));
    await expect(s).toContainText(mk.q("q.fail.expired.body"));
    await s.getByRole("button", { name: mk.q("q.fail.scan") }).click();
    await expect(page).toHaveURL(/\/app\/scan$/);
    await nothingRecorded(page);
  });

  test("a code for another class says it is not theirs, and goes home", async ({ page }) => {
    await page.goto("/app/checkin/OTHER-8A");
    const s = screen(page, "class");
    await expect(s.getByRole("alert")).toContainText(mk.q("q.fail.class.title"));
    await expect(s).toContainText(mk.q("q.fail.class.body"));
    await expect(s.getByRole("button", { name: mk.q("q.fail.scanOther") })).toBeVisible();
    await s.getByRole("button", { name: mk.q("q.home") }).click();
    await expect(page).toHaveURL(/\/app$/);
    await nothingRecorded(page);
  });

  test("a lesson that has ended says so, and goes home", async ({ page }) => {
    await page.goto("/app/checkin/ENDED-7B");
    const s = screen(page, "ended");
    await expect(s.getByRole("alert")).toContainText(mk.q("q.fail.ended.title"));
    await s.getByRole("button", { name: mk.q("q.home") }).click();
    await expect(page).toHaveURL(/\/app$/);
    await nothingRecorded(page);
  });

  test("no connection says nothing was recorded, and trying again joins", async ({ page }) => {
    await page.goto("/app/checkin/OFFLINE-7B");
    const s = screen(page, "offline");
    await expect(s.getByRole("alert")).toContainText(mk.q("q.fail.network.title"));
    await expect(s).toContainText(mk.q("q.fail.network.body"));
    await nothingRecorded(page);

    await page.goBack();
    await expect(s.getByRole("button", { name: mk.q("q.fail.retry") })).toBeVisible();
    await s.getByRole("button", { name: mk.q("q.fail.retry") }).click();
    await expect(page.getByText(mk.q("q.live"))).toBeVisible();
    await expect(page).toHaveURL(/\/app\/play\/OFFLINE-7B$/);
    await page.goto("/app");
    await expect(page.getByRole("link", { name: new RegExp(mk.t("home.attendance")) })).toContainText("88%");
  });

  test("a code nobody issued is not recognized, and offers to scan again", async ({ page }) => {
    await page.goto("/app/checkin/NOPE-9");
    const s = screen(page, "unknown");
    await expect(s.getByRole("alert")).toContainText(mk.q("q.fail.unknown.title"));
    await expect(s).toContainText(mk.q("q.fail.unknown.body"));
    await s.getByRole("button", { name: mk.q("q.fail.scan") }).click();
    await expect(page).toHaveURL(/\/app\/scan$/);
    await nothingRecorded(page);
  });

  test("each reason has its own words", async ({ page }) => {
    const titles = new Set<string>();
    for (const code of ["EXPIRED-7B", "OTHER-8A", "ENDED-7B", "NOPE-9"]) {
      await page.goto(`/app/checkin/${code}`);
      titles.add((await page.getByRole("alert").getByRole("heading").textContent()) ?? "");
    }
    expect(titles.size).toBe(4);
  });

  test("the English words are there too", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("teacheraid-locale", "en"));
    await page.goto("/app/checkin/EXPIRED-7B");
    await expect(page.getByRole("alert").filter({ hasText: "That code has expired" })).toBeVisible();
  });
});

test("joining after the lobby is a late attendance with a gentle note", async ({ page }) => {
  await page.clock.install();
  await page.goto("/app/checkin/LATE-7B");
  await expect(page.getByText(mk.q("q.late.note")).first()).toBeVisible();
  await expect(page.getByText(/Присуството е забележано во/)).toBeVisible();
  await expect(page.getByText(mk.q("q.late.note")).first()).toBeVisible();

  // The question that was open is there to answer, with the note beside it for a while.
  await page.clock.fastForward(1_900);
  await expect(page.locator(".q-opt, .q-tf__btn").first()).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: mk.q("q.late.note") })).toBeVisible();

  // The attendance says late, and joining earned no points.
  await page.goto("/app/attendance");
  await expect(page.getByText(mk.t("att.status.late"), { exact: true }).first()).toBeVisible();
  await page.goto("/app");
  await expect(page.getByRole("link", { name: new RegExp(mk.t("home.attendance")) })).toContainText("88%");
});
