import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, mk, start, test } from "../fixtures";

/** Joining on a bad connection: a plain message for each way it fails, the code kept, and a retry that asks again. */

/** Arrival animations finish before axe measures: a fade in progress shows half-faded text. */
const settled = (page: Page) =>
  page.waitForFunction(() => document.getAnimations().every((a) => a.effect?.getComputedTiming().iterations === Infinity || a.playState === "finished"));

// The scanner has its own "Try camera again" with the same words, so the sheet's button is found inside the sheet.
const retry = (page: Page) => page.locator(".scan-miss, [data-failure]").getByRole("button", { name: mk.q("q.fail.retry") });
const sheet = (page: Page) => page.locator(".scan-miss");

async function typeCode(page: Page, code: string) {
  await start(page, {});
  await page.goto("/app/join");
  await page.getByRole("button", { name: mk.t("scan.code") }).click();
  const field = page.getByRole("textbox", { name: mk.t("scan.codeLabel") });
  await field.fill(code);
  return field;
}

const go = (page: Page) => page.getByRole("button", { name: mk.t("scan.codeGo") }).click();

const clean = async (page: Page) => {
  await settled(page);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
};

test.describe("no internet", () => {
  test.use({ allowConsoleErrors: [/net::ERR/, /ERR_INTERNET_DISCONNECTED/] });

  test("says so at once, keeps the code, and retrying the same code joins when the signal is back", async ({ page, context }) => {
    const field = await typeCode(page, "482 913");
    await context.setOffline(true);
    await go(page);
    await expect(sheet(page)).toContainText(mk.t("join.offline.title"));
    await expect(sheet(page)).toContainText(mk.t("join.offline.body"));
    // One message, not two: the floating pill stays out of the way while the sheet says it.
    await expect(page.locator('.net-pill[data-net="offline"]')).toBeHidden();
    await expect(field).toHaveValue("482 913");
    await clean(page);

    await context.setOffline(false);
    await retry(page).click();
    await expect(page).toHaveURL(/\/app\/play\/482913$/);
  });

  test("a failed try gives the problem buzz once", async ({ page, context }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __buzz: unknown[] };
      w.__buzz = [];
      navigator.vibrate = ((p: unknown) => (w.__buzz.push(p), true)) as typeof navigator.vibrate;
    });
    await typeCode(page, "MATH-7B");
    await context.setOffline(true);
    await go(page);
    await expect(sheet(page)).toBeVisible();
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => (window as unknown as { __buzz: unknown[] }).__buzz)).toEqual([40]);
  });
});

test.describe("a slow connection", () => {
  test("waits calmly, adds a quiet line after 4 s, gives up after 12 s, and retrying joins", async ({ page }) => {
    await page.clock.install();
    const field = await typeCode(page, "SLOW-7B");
    await go(page);
    await page.clock.runFor(500);
    const waiting = page.locator(".scan-miss[data-joining]");
    await expect(waiting).toContainText(mk.t("join.waiting"));
    await expect(page.getByText(mk.t("join.waitingSlow"))).toHaveCount(0);
    await page.clock.runFor(4000);
    await expect(page.getByText(mk.t("join.waitingSlow"))).toBeVisible();
    await clean(page);

    // Past the 12 s limit the plain message comes (the page's clock also ran while axe looked, so this is generous).
    await page.clock.runFor(9000);
    await expect(sheet(page)).toContainText(mk.t("join.slow.title"));
    await expect(sheet(page)).toContainText(mk.t("join.slow.body"));
    await expect(field).toHaveValue("SLOW-7B");
    await clean(page);

    await retry(page).click();
    await page.clock.runFor(1000);
    await expect(page).toHaveURL(/\/app\/play\/SLOW-7B$/);
  });
});

test.describe("a server error", () => {
  test("says it is on our side, keeps the code, and retrying joins", async ({ page }) => {
    const field = await typeCode(page, "FAIL-7B");
    await go(page);
    await expect(sheet(page)).toContainText(mk.t("join.server.title"));
    await expect(sheet(page)).toContainText(mk.t("join.server.body"));
    await expect(field).toHaveValue("FAIL-7B");
    await clean(page);
    await retry(page).click();
    await expect(page).toHaveURL(/\/app\/play\/FAIL-7B$/);
    await expect(page.getByText(mk.q("q.live"))).toBeVisible();
  });
});

test.describe("the scanner's typed code", () => {
  test("a server error shows the same sheet and retrying joins the same code", async ({ page }) => {
    await start(page, {});
    await page.addInitScript(() => localStorage.setItem("teacheraid-camera-intro", "1"));
    await page.goto("/app/scan");
    await page.getByRole("button", { name: mk.t("scan.code") }).click();
    await page.getByRole("textbox", { name: mk.t("scan.codeLabel") }).fill("FAIL-7B");
    await go(page);
    await expect(sheet(page)).toContainText(mk.t("join.server.title"));
    await clean(page);
    await retry(page).click();
    await expect(page).toHaveURL(/\/app\/play\/FAIL-7B$/);
  });
});

test.describe("a link or QR that opens the lesson directly", () => {
  test("a server error is a full screen with Try again, and it joins the same code", async ({ page }) => {
    await page.goto("/app/checkin/FAIL-7B");
    const screen = page.locator("[data-failure=server]");
    await expect(screen.getByRole("alert")).toContainText(mk.t("join.server.title"));
    await clean(page);
    await retry(page).click();
    await expect(page.getByText(mk.q("q.live"))).toBeVisible();
    await expect(page).toHaveURL(/\/app\/play\/FAIL-7B$/);
  });

  test("a slow join shows the waiting screen, then the slow screen, then joins on retry", async ({ page }) => {
    await page.clock.install();
    await page.goto("/app/checkin/SLOW-7B");
    await page.clock.runFor(500);
    await expect(page.locator("[data-joining]").getByRole("status")).toContainText(mk.t("join.waiting"));
    // The hourglass sits in the same badge circle the failure screens use.
    const badge = page.locator("[data-joining] .q-badge");
    await expect(badge).toHaveClass(/q-badge--no/);
    expect((await badge.boundingBox())!.width).toBeGreaterThan(100);
    await clean(page);
    await page.clock.runFor(4000);
    await expect(page.getByText(mk.t("join.waitingSlow"))).toBeVisible();
    await page.clock.runFor(8000);
    await expect(page.locator("[data-failure=slow]").getByRole("alert")).toContainText(mk.t("join.slow.title"));
    await clean(page);
    await retry(page).click();
    await page.clock.runFor(1000);
    await expect(page.getByText(mk.q("q.live"))).toBeVisible();
  });
});
