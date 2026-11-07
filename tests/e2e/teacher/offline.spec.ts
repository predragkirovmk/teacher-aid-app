import { expect, test } from "./fixtures";
import { SHELL_ROUTES } from "../../../lib/teacher/routes";

/**
 * The offline worker (public/teacher-sw.js): the installed app opens with no signal, a page that was never kept says so plainly, and
 * nothing with a student's name is ever stored. The page registers the worker itself in a production build, as it does for a teacher.
 */

const kept = (page: import("@playwright/test").Page) =>
  page.evaluate(async () => {
    const out: Record<string, string[]> = {};
    for (const name of await caches.keys()) out[name] = (await (await caches.open(name)).keys()).map((r) => new URL(r.url).pathname);
    return out;
  });

test.describe("offline", () => {
  test("the app opens with no signal, a page never kept says so, and no data is stored", async ({ page, context }) => {
    await page.goto("/teacher");
    await page.evaluate(() => navigator.serviceWorker.ready);
    // The worker keeps the shell of the app once it is warmed: wait for the last of its pages.
    await expect.poll(async () => ((await kept(page))["teacher-pages"] ?? []).length, { timeout: 30_000 }).toBe(SHELL_ROUTES.length);
    await expect.poll(async () => ((await kept(page))["teacher-static"] ?? []).some((p) => p.includes("/media/")), { timeout: 30_000 }).toBe(true);

    // Only the shell, the app's files and the icons: no lesson, no class view, no end page, no API call.
    const all = await kept(page);
    for (const path of all["teacher-pages"]) expect(SHELL_ROUTES, path).toContain(path);
    for (const path of all["teacher-static"]) expect(path, path).toMatch(/^\/(_next\/static\/|teacher-icons\/|teacher\.webmanifest|teacher-offline\.html)/);

    await context.setOffline(true);
    await page.goto("/teacher/library");
    await expect(page.getByRole("heading", { level: 1, name: "Библиотека" })).toBeVisible();

    await page.goto("/teacher/lessons/l-procenti").catch(() => undefined);
    await expect(page.getByRole("heading", { name: "Нема интернет" })).toBeVisible();
    await expect(page.getByText("Часот и лекциите бараат интернет; обидете се повторно кога ќе се поврзете.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Обиди се повторно" })).toBeFocused();
    await context.setOffline(false);
  });

  test("the manifest is one Chrome offers to install", async ({ request }) => {
    const m = await (await request.get("/teacher.webmanifest")).json();
    expect(m).toMatchObject({ name: "TeacherAid за наставници", short_name: "TeacherAid", start_url: "/teacher", scope: "/teacher", display: "standalone", background_color: "#124554", theme_color: "#124554" });
    const icons = m.icons as { sizes: string; purpose: string; src: string }[];
    expect(icons.some((i) => i.sizes === "192x192")).toBe(true);
    expect(icons.some((i) => i.sizes === "512x512" && i.purpose === "any")).toBe(true);
    expect(icons.some((i) => i.purpose === "maskable")).toBe(true);
    for (const i of icons) expect((await request.get(i.src)).ok(), i.src).toBe(true);
    const sw = await request.get("/teacher-sw.js");
    expect(sw.headers()["cache-control"]).toContain("no-cache");
    expect((await request.get("/teacher-offline.html")).ok()).toBe(true);
  });
});
