import { expect, mk, start, test } from "../fixtures";

const FILE = "**/app-demo/handout.pdf";

test.beforeEach(async ({ page }) => {
  // The demo's handout opens in a new tab; what it holds is not the test's business.
  await page.context().route(FILE, (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<p>Handout</p>" }));
});

test("Home shows the newest three documents with teacher, date, kind and size, and a link to all four", async ({ page }) => {
  await page.goto("/app");
  const section = page.locator("section[aria-labelledby=home-docs]");
  await expect(section.getByRole("heading", { name: mk.t("docs.title") })).toBeVisible();
  await expect(section.getByText(mk.t("docs.sub"))).toBeVisible();
  const rows = section.locator("a.item--doc");
  await expect(rows).toHaveCount(3);
  await expect(rows.first()).toContainText(mk.t("doc.d1"));
  await expect(rows.first()).toContainText(mk.t("teacher.math"));
  await expect(rows.first()).toContainText(`${mk.t("doc.type.pdf")} · 240 KB`);
  // A row is a plain link to the signed address in a new tab: no `download`, which a cross-origin address ignores.
  await expect(rows.first()).toHaveAttribute("target", "_blank");
  await expect(rows.first()).toHaveAttribute("rel", "noopener");
  await expect(rows.first()).not.toHaveAttribute("download", /.*/);

  await section.getByRole("link", { name: mk.t("docs.all") }).click();
  await expect(page).toHaveURL(/\/app\/documents$/);
});

test("a tap opens the document in a new tab and the New mark of that row goes", async ({ page }) => {
  await page.goto("/app");
  const rows = page.locator("section[aria-labelledby=home-docs] a.item--doc");
  await expect(rows.locator(".tile__new")).toHaveCount(3);
  const [popup] = await Promise.all([page.context().waitForEvent("page"), rows.first().click()]);
  await popup.waitForLoadState();
  expect(new URL(popup.url()).pathname).toBe("/app-demo/handout.pdf");
  await popup.close();
  await expect(rows.first().locator(".tile__new")).toHaveCount(0);
  await expect(rows.locator(".tile__new")).toHaveCount(2);
  // It stays opened after a reload.
  await page.reload();
  await expect(rows.locator(".tile__new")).toHaveCount(2);
});

test("the documents screen lists all four", async ({ page }) => {
  await page.goto("/app/documents");
  await expect(page.locator("a.item--doc")).toHaveCount(4);
  await expect(page.locator("a.item--doc").last()).toContainText(mk.t("doc.d4"));
  await expect(page.getByText(mk.t("docs.none"))).toHaveCount(0);
});

test("with none sent, Home says so in one line and the screen is calm", async ({ page }) => {
  await start(page, { state: { signedIn: true, docs: [] } });
  await page.goto("/app");
  const section = page.locator("section[aria-labelledby=home-docs]");
  await expect(section.getByText(mk.t("docs.none"))).toBeVisible();
  await expect(section.locator("a.item--doc")).toHaveCount(0);
  await expect(section.getByRole("link", { name: mk.t("docs.all") })).toHaveCount(0);

  await page.goto("/app/documents");
  await expect(page.getByText(mk.t("docs.none"))).toBeVisible();
  await expect(page.getByRole("button", { name: mk.t("state.retry") })).toHaveCount(0);
});

for (const width of [390, 360]) {
  test(`a document's caption is one line at ${width} and only the teacher's name gives way`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/app/documents");
    const captions = page.locator("a.item--doc .res-cap");
    await expect(captions.first()).toBeVisible();
    const lines = await captions.evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight))));
    expect(lines).toEqual([1, 1, 1, 1]);
    // The fixed parts (mark, date, kind, size) show whole; the teacher may be cut with an ellipsis.
    const fixedCut = await captions.evaluateAll((els) => els.flatMap((el) => [...el.querySelectorAll<HTMLElement>(".res-cap__fixed")]).filter((n) => n.scrollWidth > n.clientWidth + 1).length);
    expect(fixedCut).toBe(0);
    const teachers = await captions.evaluateAll((els) => els.map((el) => el.querySelector<HTMLElement>(".doc-cap__teacher")!.getBoundingClientRect().width));
    expect(teachers.every((w) => w >= 24)).toBe(true);
  });
}
