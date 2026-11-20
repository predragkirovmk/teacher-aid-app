import { expect, mk, test } from "../fixtures";

test("mark all alerts read clears the unread count", async ({ page }) => {
  await page.goto("/app");
  const bell = page.locator(".home-bar").getByRole("link", { name: mk.t("notif.title") });
  const unreadLabel = mk.t("notif.unreadCount", { n: 3 });
  const unreadRows = page.locator(".item--unread");

  await expect(bell).toHaveAccessibleName(new RegExp(unreadLabel));
  await bell.click();
  await expect(unreadRows).toHaveCount(3);
  // Let the slide in finish: a second view transition started while it runs skips it, which the browser reports as an error.
  // The scan pill's idle cycle never ends, so only animations that finish count.
  await page.waitForFunction(() => document.getAnimations().every((a) => a.effect?.getComputedTiming().iterations === Infinity));

  await page.getByRole("button", { name: mk.t("notif.markAll") }).click();

  await expect(page.getByRole("button", { name: mk.t("notif.markAll") })).toHaveCount(0);
  await expect(unreadRows).toHaveCount(0);

  // The saved data keeps it read, and the bell on Home has no count.
  await page.reload();
  await expect(page.getByRole("button", { name: mk.t("notif.markAll") })).toHaveCount(0);
  await page.getByRole("button", { name: mk.t("back") }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(bell).not.toHaveAccessibleName(new RegExp(unreadLabel));
});

test("opening an alert marks it read and lands on what it is about", async ({ page }) => {
  await page.goto("/app/notifications");
  await page.getByRole("link", { name: new RegExp(mk.t("notif.result_ready.title")) }).click();
  await expect(page).toHaveURL(/\/app\/notifications\/n-math$/);
});

test("a practice alert opens the set it announces, and starting the set reads the alert", async ({ page }) => {
  await page.goto("/app/notifications");
  // Two practice alerts say the same thing now that none names a subject, so this one is found by where it leads.
  const alert = page.locator('a[href="/app/notifications/n-practice-ps-session-math-1"]');
  await expect(alert).toContainText(mk.t("notif.practice_set_sent.title"));
  await alert.click();
  await expect(page).toHaveURL(/\/app\/notifications\/n-practice-ps-session-math-1$/);
  await page.getByRole("link", { name: mk.t("notif.open.practice") }).click();
  await expect(page).toHaveURL(/\/app\/practice\/ps-session-math-1$/);
  await expect(page.getByText(mk.t("pr.progress", { n: 1, total: 4 }))).toBeVisible();
});
