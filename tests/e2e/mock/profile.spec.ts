import { expect, mk, test } from "../fixtures";

test("editing the profile name changes it everywhere and keeps it", async ({ page }) => {
  await page.goto("/app/profile");
  await page.getByRole("button", { name: mk.q("p.edit") }).click();

  const name = page.getByRole("textbox", { name: mk.q("p.name") });
  await expect(name).toHaveValue("Марко Трајковски");
  await name.fill("Мики Т");
  await page.getByRole("button", { name: mk.q("p.save") }).click();

  await expect(page.getByText(mk.q("p.saved")).first()).toBeVisible();
  await expect(page.locator(".profile__name")).toContainText("Мики Т");

  await page.goto("/app");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Мики");
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Мики");
});

test("a display name must be 2 to 24 characters", async ({ page }) => {
  await page.goto("/app/profile");
  await page.getByRole("button", { name: mk.q("p.edit") }).click();
  const name = page.getByRole("textbox", { name: mk.q("p.name") });
  const save = page.getByRole("button", { name: mk.q("p.save") });

  await expect(save).toBeDisabled(); // nothing changed yet

  await name.fill("М");
  await expect(save).toBeDisabled();
  await expect(page.getByText(mk.q("p.err.short"))).toBeVisible();

  await name.fill("");
  await expect(save).toBeDisabled();

  await name.fill("Ма");
  await expect(save).toBeEnabled();

  // The field takes no more than 24.
  await name.fill("А".repeat(40));
  await expect(name).toHaveValue("А".repeat(24));
  await expect(save).toBeEnabled();
});

test("cancelling with changes asks before throwing them away", async ({ page }) => {
  await page.goto("/app/profile");
  await page.getByRole("button", { name: mk.q("p.edit") }).click();
  await page.getByRole("textbox", { name: mk.q("p.name") }).fill("Друго");
  await page.getByRole("button", { name: mk.q("p.cancel") }).click();

  await expect(page.getByRole("alert").filter({ hasText: mk.q("p.discard") })).toBeVisible();
  await page.getByRole("button", { name: mk.q("p.discardConfirm") }).click();
  await expect(page.locator(".profile__name")).toContainText("Марко Трајковски");
});
