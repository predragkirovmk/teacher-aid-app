import { expect, mk, test } from "../fixtures";

test("mark all alerts read clears the unread count", async ({ page }) => {
  await page.goto("/app/notifications");
  const tabs = page.getByRole("navigation", { name: mk.t("nav.main") });
  const unreadLabel = mk.t("notif.unreadCount", { n: 2 });
  const unreadRows = page.locator(".item--unread");

  await expect(tabs).toContainText(unreadLabel);
  await expect(unreadRows).toHaveCount(2);

  await page.getByRole("button", { name: mk.t("notif.markAll") }).click();

  await expect(page.getByRole("button", { name: mk.t("notif.markAll") })).toHaveCount(0);
  await expect(unreadRows).toHaveCount(0);
  await expect(tabs).not.toContainText(unreadLabel);

  // The saved data keeps it read.
  await page.reload();
  await expect(page.getByRole("button", { name: mk.t("notif.markAll") })).toHaveCount(0);
});

test("opening an alert marks it read and lands on what it is about", async ({ page }) => {
  await page.goto("/app/notifications");
  await page.getByRole("link", { name: new RegExp(mk.t("notif.result_ready.title", { subject: mk.t("subj.math") })) }).click();
  await expect(page).toHaveURL(/\/app\/notifications\/n-math$/);
});
