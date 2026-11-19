import { expect, mk, test } from "../fixtures";

test("Home shows the name, the practice row and the latest result, and nothing else", async ({ page }) => {
  await page.goto("/app");

  await expect(page.getByRole("heading", { level: 1 })).toContainText("Марко");
  // The time-bound parts fill in once the phone's clock is read.
  await expect(page.locator("main.screen")).not.toHaveAttribute("data-pending", "");

  await expect(page.getByRole("link", { name: new RegExp(mk.t("pr.title")) })).toBeVisible();

  const latest = page.getByRole("link", { name: new RegExp(mk.t("home.summary")) });
  await expect(latest).toContainText("4/5");
  await expect(latest).toContainText(mk.t("subj.math"));

  // No next lesson, test, ranking, attendance or timetable: the cards for them are gone, and so are their screens.
  await expect(page.locator("main.screen .next")).toHaveCount(0);
  await expect(page.locator("main.screen .card.tile")).toHaveCount(1);
  for (const gone of ["attendance", "leaderboard", "schedule"]) {
    await expect(page.locator(`a[href="/app/${gone}"]`)).toHaveCount(0);
  }
});

test("Home has no subjects row, and the bell takes the place of the avatar", async ({ page }) => {
  await page.goto("/app");
  await expect(page.getByRole("link", { name: mk.t("nav.profile") })).toHaveCount(1);
  await expect(page.locator(".home-bar").getByRole("link", { name: mk.t("notif.title") })).toBeVisible();
  await expect(page.locator(".home-bar .avatar")).toHaveCount(0);
});
