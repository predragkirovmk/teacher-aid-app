import jsQR from "jsqr";
import type { BrowserContext, Locator, Page } from "@playwright/test";
import { planClass, simulate } from "../../lib/teacher/api/mock-live";
import { expect } from "./fixtures";

/**
 * What the tests of the live lesson share: the clock they hold still, the class they know, and the steps that start a lesson and open the projector.
 */

export const T0 = Date.parse("2026-10-29T09:30:05+01:00");
export const SESSION = "s-n1";
export const CLASS_IDS = Array.from({ length: 26 }, (_, i) => `st-ii-4-${String(i + 1).padStart(2, "0")}`);
export const PLANS = planClass(SESSION, CLASS_IDS);

export const title = (page: Page) => page.getByRole("heading", { level: 1 });
export const yellow = (page: Page) => page.locator(".btn--primary:visible");
export const cards = (page: Page) => page.locator(".lessons > li");
export const startDialog = (page: Page) => page.getByRole("dialog", { name: /^Со кој(а)? (клас|група)\?$/ });
export const people = (page: Page) => page.locator(".person");
export const count = (page: Page) => page.locator(".roster__count");
export const code = (page: Page) => page.getByTestId("short-code");
export const classCode = (page: Page) => page.getByTestId("class-code");

/**
 * Move the clock of every window of the browser to `seconds` after the lesson began, and, with the console's `page`, wait until it shows the
 * class as that moment has it (the console looks again once a second), so that what a test does next is done to the class it can see.
 */
export const at = async (context: BrowserContext, seconds: number, page?: Page, teachingAt: number | null = null) => {
  await context.clock.setFixedTime(T0 + seconds * 1000);
  if (page) await expect(count(page)).toHaveText(new RegExp(`^${joinedAt(seconds, teachingAt)} (од|of) 26 `));
};

/** How many of the class have joined `seconds` after the lesson began, with the lesson moved on at `teachingAt` seconds (null: still in the lobby). */
export const joinedAt = (seconds: number, teachingAt: number | null = null) =>
  PLANS.filter((p) => simulate(p, { started_at: T0, teaching_at: teachingAt === null ? null : T0 + teachingAt * 1000, now: T0 + seconds * 1000 }).joined_at !== null).length;

export async function start(page: Page, context: BrowserContext, className = "II-4") {
  await context.clock.setFixedTime(T0);
  await page.goto("/teacher");
  await cards(page).filter({ hasText: "Проценти и пропорции" }).getByRole("button", { name: "Започни час" }).click();
  const dialog = startDialog(page);
  await dialog.getByRole("radio", { name: new RegExp(className) }).check();
  await dialog.getByRole("button", { name: `Започни со ${className}` }).click();
  await expect(page).toHaveURL(new RegExp(`/teacher/live/${SESSION}$`));
  await expect(count(page)).toBeVisible();
}

/** The console's button that opens the projector, and the page it opens. */
export async function openProjector(page: Page, context: BrowserContext, name = "Отвори го екранот за проектор") {
  const opened = context.waitForEvent("page");
  await page.getByRole("button", { name }).click();
  const projector = await opened;
  await projector.waitForLoadState();
  return projector;
}

/** A student who has not joined at `seconds` and will, a while after: for the tests of a mark that a join then replaces. */
export const comesLater = (seconds: number) => PLANS.filter((p) => p.kind === "early" && p.after_ms > seconds * 1000).sort((a, b) => a.after_ms - b.after_ms)[0];
export const row = (page: Page, id: string) => page.locator(".person", { has: page.locator(`[data-mark="${id}"], [data-remove="${id}"]`) });


/** What a phone reads from the QR of a class view, as the page hands over its pixels and the test decodes them. */
export async function readQr(qr: Locator): Promise<string | undefined> {
  const pixels = await qr.evaluate(async (svg) => {
    const source = new XMLSerializer().serializeToString(svg).replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" ');
    const image = new Image();
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 300;
    const g = canvas.getContext("2d")!;
    g.fillStyle = "#fff";
    g.fillRect(0, 0, 300, 300);
    g.drawImage(image, 0, 0, 300, 300);
    return Array.from(g.getImageData(0, 0, 300, 300).data);
  });
  return jsQR(Uint8ClampedArray.from(pixels), 300, 300)?.data;
}

/** The moment the code changes next, as the mock's own clock counts it. */
export const nextEdge = () => Math.ceil(T0 / 30_000) * 30_000;

export type { Page };

// ---- The questions of a lesson (step 9) ----

/** The lesson begins teaching this long after it began: the clock stands here when the questions start. */
export const TEACHING_AT = 30;

/** Move every window's clock to `seconds` after the lesson began. The stream looks again once a second, so what a test expects is waited for. */
export const go = (context: BrowserContext, seconds: number) => context.clock.setFixedTime(T0 + seconds * 1000);

/** The panel "Прашањето сега". */
export const panel = (page: Page) => page.locator(".qpanel");
export const send = (page: Page) => panel(page).getByRole("button", { name: "Испрати го прашањето", exact: true });
export const reveal = (page: Page) => panel(page).getByRole("button", { name: "Прикажи го точниот одговор" });
export const next = (page: Page) => panel(page).getByRole("button", { name: "Испрати го следното прашање" });
export const skipInPanel = (page: Page) => panel(page).getByRole("button", { name: "Прескокни", exact: true });
/** A question's own "Испрати" in the list, by its number in the lesson. */
export const listSend = (page: Page, n: number) => page.getByRole("button", { name: `Испрати го прашањето ${n}`, exact: true });
export const listItem = (page: Page, n: number) => page.locator(".qitem").nth(n - 1);

/** Start the lesson, open the projector, let the class join, and begin teaching: the console and the projector, both at the panel's first state. */
export async function teach(page: Page, context: BrowserContext): Promise<Page> {
  await start(page, context);
  const projector = await openProjector(page, context);
  await at(context, TEACHING_AT, page);
  await page.getByRole("button", { name: "Почни го часот" }).click();
  await page.getByRole("button", { name: "Да, почни го часот" }).click();
  await expect(panel(page)).toBeVisible();
  return projector;
}

/** How many had joined when the first question was sent at `TEACHING_AT`. */
export const joinedWhenTeaching = () => joinedAt(TEACHING_AT, TEACHING_AT);
