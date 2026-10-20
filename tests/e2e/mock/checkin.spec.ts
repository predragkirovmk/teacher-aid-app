import { expect, mk, test } from "../fixtures";

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

test("an unknown code shows the failure screen and a way to scan again", async ({ page }) => {
  await page.goto("/app/checkin/NOPE-9");

  const alert = page.getByRole("alert").filter({ hasText: mk.q("q.unknown.title") });
  await expect(alert).toContainText(mk.q("q.unknown.title"));
  await expect(alert).toContainText(mk.q("q.unknown.body"));

  await page.getByRole("button", { name: mk.q("q.unknown.cta") }).click();
  await expect(page).toHaveURL(/\/app\/scan$/);

  // Nothing was recorded.
  await page.goto("/app");
  await expect(page.getByRole("link", { name: new RegExp(mk.t("home.attendance")) })).toContainText("87%");
});
