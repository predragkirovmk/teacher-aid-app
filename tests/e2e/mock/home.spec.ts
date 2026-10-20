import { expect, mk, test } from "../fixtures";

test("Home shows the name, rank, attendance and the latest result", async ({ page }) => {
  await page.goto("/app");

  await expect(page.getByRole("heading", { level: 1 })).toContainText("Марко");
  // The time-bound parts fill in once the phone's clock is read.
  await expect(page.locator("main.screen")).not.toHaveAttribute("data-pending", "");

  const rank = page.getByRole("link", { name: new RegExp(mk.t("home.leaderboard")) });
  await expect(rank).toContainText("#4");
  await expect(rank).toContainText(mk.t("home.rankCaption"));

  await expect(page.getByRole("link", { name: new RegExp(mk.t("home.attendance")) })).toContainText("87%");

  const latest = page.getByRole("link", { name: new RegExp(mk.t("home.summary")) });
  await expect(latest).toContainText("4/5");
  await expect(latest).toContainText(mk.t("subj.math"));
});

test("Home lists the subjects", async ({ page }) => {
  await page.goto("/app");
  await page.getByRole("link", { name: new RegExp(mk.t("home.allSubjects")) }).click();
  await expect(page).toHaveURL(/\/app\/subjects$/);
  await expect(page.getByRole("link", { name: new RegExp(mk.t("subj.math")) }).first()).toBeVisible();
});
