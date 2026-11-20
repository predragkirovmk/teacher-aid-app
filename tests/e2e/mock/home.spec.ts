import { expect, mk, start, test } from "../fixtures";

test("Home leads with the practice card, then the recent quizzes and the teachers' documents", async ({ page }) => {
  await page.goto("/app");

  await expect(page.getByRole("heading", { level: 1 })).toContainText("Марко");
  // The time-bound parts fill in once the phone's clock is read.
  await expect(page.locator("main.screen")).not.toHaveAttribute("data-pending", "");

  // The yellow card is the first thing after the header, says what waits, and opens that set.
  const card = page.locator("main.screen a.next");
  await expect(card).toContainText(mk.t("pr.title"));
  await expect(card).toContainText(mk.t("pr.home.new1", { title: mk.t("sum.lesson") }));
  await expect(card).toContainText(mk.t("pr.start"));
  expect(await card.evaluate((el) => el.closest(".stack")!.firstElementChild!.contains(el))).toBe(true);
  await card.click();
  await expect(page).toHaveURL(/\/app\/practice\/ps-session-math-1$/);
});

test("with nothing waiting the card says so and opens the list", async ({ page }) => {
  await start(page, { state: { signedIn: true, practiceDone: { "ps-session-math-1": Date.now() } } });
  await page.goto("/app");
  const card = page.locator("main.screen a.next");
  await expect(card).toContainText(mk.t("pr.home.none"));
  await expect(card).toHaveClass(/next--quiet/);
  await expect(card.locator(".next__action")).toHaveCount(0);
  // The same full yellow as the waiting card, which paints `.next` with var(--yellow).
  const bg = await card.evaluate((el) => {
    const probe = document.createElement("a");
    probe.className = "next";
    el.parentElement!.appendChild(probe);
    const waiting = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return [getComputedStyle(el).backgroundColor, waiting];
  });
  expect(bg[0]).toBe(bg[1]);
  await card.click();
  await expect(page).toHaveURL(/\/app\/practice$/);
});

test("with more than one set waiting the card counts them and opens the list, not one set", async ({ page }) => {
  // A second set sent after a lesson, beside the demo's fractions set: two are new.
  const second = {
    id: "ps-session-phys-9",
    sessionId: "session-phys-9",
    courseId: "physics",
    lessonTitle: "Physics",
    createdAt: new Date("2026-10-13T10:00").getTime(),
    questionIds: ["p3", "p1", "p5"],
  };
  await start(page, { state: { signedIn: true, practiceSets: [second] } });
  await page.goto("/app");
  const card = page.locator("main.screen a.next");
  await expect(card).toContainText(mk.t("pr.home.newN", { n: 2 }));
  await expect(card).toHaveAttribute("href", "/app/practice");
  await card.click();
  await expect(page).toHaveURL(/\/app\/practice$/);
});

test("Home lists the three newest quizzes, each opening its summary, and a link to all results", async ({ page }) => {
  await page.goto("/app");
  await expect(page.getByRole("heading", { name: mk.t("home.recent") })).toBeVisible();

  const rows = page.locator("section[aria-labelledby=home-recent] a.item");
  await expect(rows).toHaveCount(3);
  // Newest first: the same order as the results list.
  const hrefs = await rows.evaluateAll((els) => els.map((e) => e.getAttribute("href")));
  await page.goto("/app/summary");
  const all = await page.locator("main.screen ul.list a.item").evaluateAll((els) => els.map((e) => e.getAttribute("href")));
  expect(hrefs).toEqual(all.slice(0, 3));

  await page.goto("/app");
  await page.getByRole("link", { name: mk.t("home.allResults") }).click();
  await expect(page).toHaveURL(/\/app\/summary$/);
  await page.goBack();
  await rows.first().click();
  await expect(page).toHaveURL(new RegExp(`${hrefs[0]}$`));
});

test("a result whose alert is unread carries the New tag", async ({ page }) => {
  await page.goto("/app");
  const tagged = page.locator("section[aria-labelledby=home-recent] a.item", { hasText: mk.t("home.new") });
  await expect(tagged).toHaveCount(1);
});

test("the documents section shows three rows and a link to all four, and a tap says it is a demo", async ({ page }) => {
  await page.goto("/app");
  const section = page.locator("section[aria-labelledby=home-docs]");
  await expect(section.getByRole("heading", { name: mk.t("docs.title") })).toBeVisible();
  await expect(section.getByText(mk.t("docs.sub"))).toBeVisible();
  const rows = section.locator("button.item");
  await expect(rows).toHaveCount(3);
  await expect(rows.first()).toContainText(mk.t("doc.pdf"));
  await rows.first().click();
  await expect(page.locator(".toast")).toContainText(mk.t("doc.demo"));

  await section.getByRole("link", { name: mk.t("docs.all") }).click();
  await expect(page).toHaveURL(/\/app\/documents$/);
});

test("Home has no subjects row, and the bell takes the place of the avatar", async ({ page }) => {
  await page.goto("/app");
  await expect(page.getByRole("link", { name: mk.t("nav.profile") })).toHaveCount(1);
  await expect(page.locator(".home-bar").getByRole("link", { name: mk.t("notif.title") })).toBeVisible();
  await expect(page.locator(".home-bar .avatar")).toHaveCount(0);
  for (const gone of ["attendance", "leaderboard", "schedule"]) {
    await expect(page.locator(`a[href="/app/${gone}"]`)).toHaveCount(0);
  }
});

for (const width of [390, 360]) {
  test(`a quiz row's caption stays on one line at ${width}, on Home and on the results list`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    for (const url of ["/app", "/app/summary"]) {
      await page.goto(url);
      const captions = page.locator("a.item .res-cap");
      await expect(captions.first()).toBeVisible();
      const lines = await captions.evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight))));
      expect(lines.length).toBeGreaterThan(0);
      expect(lines.every((n) => n === 1)).toBe(true);
      // Nothing in it is cut off: the "New" mark and the date show whole.
      const clipped = await captions.evaluateAll((els) => els.filter((el) => el.scrollWidth > el.clientWidth + 1).length);
      expect(clipped).toBe(0);
    }
  });
}

test("Home, the results list and a document row show no subject: no name from the mock and no subject mark", async ({ page }) => {
  const names = ["math", "physics", "mkd", "english", "german", "biology", "history", "geography", "informatics", "art", "music", "pe"].map((id) => mk.t(`subj.${id}` as Parameters<typeof mk.t>[0]));
  for (const url of ["/app", "/app/summary", "/app/documents"]) {
    await page.goto(url);
    await expect(page.locator("main.screen")).not.toHaveAttribute("data-pending", "");
    const text = (await page.locator("main.screen").innerText()).toLowerCase();
    for (const name of names) expect(text, `${url} says ${name}`).not.toContain(name.toLowerCase());
    // A letter or sign for a subject (π, Ѓ ...) is gone: every quiz tile holds the same icon and no text.
    const tiles = page.locator("a.item--result .mark");
    for (const tile of await tiles.all()) {
      await expect(tile.locator("svg")).toHaveCount(1);
      expect(await tile.innerText()).toBe("");
    }
  }
  await page.goto("/app/summary");
  expect(await page.locator("a.item--result .mark").count()).toBeGreaterThan(0);
  const icons = await page.locator("a.item--result .mark svg").evaluateAll((els) => new Set(els.map((e) => e.innerHTML)).size);
  expect(icons).toBe(1);
  await page.goto("/app/documents");
  await expect(page.locator("button.item").first()).toBeVisible();
});
