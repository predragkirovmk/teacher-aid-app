import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, mk, start, test } from "../fixtures";

/** The camera intro is answered, so the scanner shows its camera area (a headless browser has none) and its tools. */
const seen = (page: Page) => page.addInitScript(() => localStorage.setItem("teacheraid-camera-intro", "1"));

async function openCode(page: Page) {
  await start(page, {});
  await seen(page);
  await page.goto("/app/scan");
  await page.getByRole("button", { name: mk.t("scan.code") }).click();
  return page.getByRole("textbox", { name: mk.t("scan.codeLabel") });
}

test("a typed class code joins the quiz", async ({ page }) => {
  const field = await openCode(page);
  await expect(field).toBeFocused();
  // The sample code is a hint line, never a placeholder that could be mistaken for a typed value.
  await expect(field).not.toHaveAttribute("placeholder", /.+/);
  await expect(field).toHaveValue("");
  await expect(page.getByText(mk.t("scan.codeHint"))).toBeVisible();
  // Lowercase and stray spaces are fixed before the code is sent: it joins as shown, in capitals.
  await field.fill(" math-7b ");
  await page.getByRole("button", { name: mk.t("scan.codeGo") }).click();
  await expect(page).toHaveURL(/\/app\/play\/MATH-7B$/);
  await expect(page.getByText(mk.q("q.live"))).toBeVisible();
});

test("a code nobody issued shows the Miss sheet", async ({ page }) => {
  const field = await openCode(page);
  await field.fill("NOPE-9");
  await field.press("Enter");
  await expect(page.locator(".scan-miss")).toContainText(mk.q("q.fail.unknown.title"));
  await expect(page).toHaveURL(/\/app\/scan$/);
});

test("an empty or malformed code says so in place, tied to the field", async ({ page }) => {
  const field = await openCode(page);
  await field.press("Enter");
  const note = page.locator(".scan-code__err");
  await expect(note).toHaveText(mk.t("scan.codeEmpty"));
  // The hint line stays in the field's description, and the note joins it.
  const describedBy = (await field.getAttribute("aria-describedby"))!.split(" ");
  expect(describedBy).toContain((await note.getAttribute("id"))!);
  expect(describedBy).toHaveLength(2);
  await field.fill("hello there");
  await page.getByRole("button", { name: mk.t("scan.codeGo") }).click();
  await expect(note).toHaveText(mk.t("scan.codeBad"));
  // Focus stays in the field after an error, also when the button was tapped.
  await expect(field).toBeFocused();
  await expect(page.locator(".scan-miss")).toHaveCount(0);
  // Typing again clears the note.
  await field.fill("M");
  await expect(note).toHaveCount(0);
});

test("with no camera the scanner still offers Enter the code, and it works with the keyboard alone", async ({ page }) => {
  await start(page, {});
  await seen(page);
  await page.goto("/app/scan");
  await expect(page.getByRole("region", { name: mk.t("scan.camera") })).toBeVisible();
  // A headless browser has no camera: the scanner says so.
  await expect(page.locator(".scan__msg--block")).toBeVisible();
  const enter = page.getByRole("button", { name: mk.t("scan.code") });
  await expect(enter).toBeVisible();
  await enter.focus();
  await page.keyboard.press("Enter");
  await page.keyboard.type("MATH-7B");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/app\/play\/MATH-7B$/);
});

test.describe("accessibility", () => {
  test("axe finds nothing serious on the scanner, with and without the code field", async ({ page }) => {
    const field = await openCode(page);
    await field.press("Enter");
    const open = await new AxeBuilder({ page }).analyze();
    await page.goto("/app/scan");
    const closed = await new AxeBuilder({ page }).analyze();
    for (const r of [open, closed]) expect(r.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual([]);
  });
});
