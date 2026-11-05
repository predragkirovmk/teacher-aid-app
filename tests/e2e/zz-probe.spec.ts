import { expect, test } from "./fixtures";
import { at, openProjector, start, T0 } from "./live-helpers";

const OUT = "/private/tmp/claude-501/-Users-pedza--claude-spares-spare-6tm0sb/a6653917-a4c3-4f03-950a-bd66b3acca09/scratchpad/step9";

test("probe", async ({ page, context }) => {
  await start(page, context);
  const projector = await openProjector(page, context);
  await at(context, 30, page);
  await page.getByRole("button", { name: "Почни го часот" }).click();
  await page.getByRole("button", { name: "Да, почни го часот" }).click();
  await expect(page.getByRole("heading", { name: "Прашањето сега" })).toBeVisible();
  await page.screenshot({ path: `${OUT}/probe-send.png` });
  await page.getByRole("button", { name: "Испрати го прашањето", exact: true }).click();
  await context.clock.setFixedTime(T0 + 40_000);
  await expect(page.getByTestId("countdown")).toBeVisible();
  await page.screenshot({ path: `${OUT}/probe-open.png` });
  await projector.screenshot({ path: `${OUT}/probe-cv-open.png` });
  console.log(await page.getByTestId("countdown").innerText(), await page.getByTestId("progress").innerText());
});
