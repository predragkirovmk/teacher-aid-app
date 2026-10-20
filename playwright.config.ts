import { defineConfig, devices } from "@playwright/test";

/**
 * Smoke tests of the student app on an iPhone-size touch screen.
 *
 *   pnpm test:e2e         builds the app in mock mode (the default) and runs tests/e2e/mock
 *   pnpm test:e2e:live    builds it in live mode against tests/fake-api and runs tests/e2e/live
 *   BASE_URL=https://... pnpm test:e2e     runs the mock tests against an already deployed build
 *   E2E_SKIP_BUILD=1 pnpm test:e2e         reuses the build already in .next (or .next-live)
 *
 * A production build served over plain http://localhost would be unstyled: its CSP carries
 * upgrade-insecure-requests, which turns every asset request into https. NEXT_PUBLIC_E2E=1 drops
 * that one directive (next.config.ts), so it is set on the build here and nowhere else.
 */
const live = process.env.E2E_MODE === "live";
const external = process.env.BASE_URL;
const port = Number(process.env.E2E_PORT ?? (live ? 3102 : 3100));
const apiPort = Number(process.env.E2E_API_PORT ?? 3101);
const apiUrl = `http://127.0.0.1:${apiPort}`;
const skipBuild = process.env.E2E_SKIP_BUILD === "1";
const ci = !!process.env.CI;

const buildEnv: Record<string, string> = live
  ? { NEXT_PUBLIC_E2E: "1", NEXT_PUBLIC_API_MODE: "live", NEXT_PUBLIC_API_URL: apiUrl, NEXT_DIST_DIR: ".next-live" }
  : { NEXT_PUBLIC_E2E: "1" };

const app = {
  command: `${skipBuild ? "" : "pnpm exec next build && "}pnpm exec next start -p ${port}`,
  url: `http://localhost:${port}/app/build`,
  env: buildEnv,
  reuseExistingServer: !ci,
  timeout: 300_000,
  stdout: "pipe" as const,
};

const fakeApi = {
  command: "node tests/fake-api/server.mts",
  url: `${apiUrl}/__control/state`,
  env: { FAKE_API_PORT: String(apiPort) },
  reuseExistingServer: !ci,
  timeout: 30_000,
};

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: ci,
  retries: ci ? 1 : 0,
  workers: ci ? 2 : undefined,
  reporter: ci ? [["list"], ["html", { open: "never" }]] : "list",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: external ?? `http://localhost:${port}`,
    // iPhone size and touch, on Chromium: the browser the CI and this machine have.
    ...devices["iPhone 13"],
    browserName: "chromium",
    // The offline worker would keep one test's pages for the next.
    serviceWorkers: "block",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "mock", testDir: "tests/e2e/mock" },
    // The live tests share one fake server and its state, so they run in order, in one worker.
    { name: "live", testDir: "tests/e2e/live", fullyParallel: false },
  ],
  webServer: external ? undefined : live ? [fakeApi, app] : [app],
});
