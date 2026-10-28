import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;

/**
 * Smoke tests of the teacher app in mock mode, against a production build served over http. A production build over
 * plain http://localhost is unstyled because of the CSP's upgrade-insecure-requests, so the build for the tests is made
 * with NEXT_PUBLIC_E2E=1 (see next.config.ts), which drops that one directive.
 */
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    // On a developer's computer the Chrome that is already installed is used, so nothing has to be downloaded; CI installs
    // Playwright's own Chromium.
    channel: process.env.CI ? undefined : "chrome",
    trace: "retain-on-failure",
    timezoneId: "Europe/Skopje",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 720 } } }],
  webServer: {
    command: `pnpm build && pnpm exec next start -p ${PORT}`,
    url: `http://localhost:${PORT}/teacher`,
    env: { NEXT_PUBLIC_E2E: "1" },
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
  },
});
