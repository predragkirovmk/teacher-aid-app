// The repository's Playwright config for a cloud container: the browser is the one already installed there, and no trace is kept.
// Run it from the repository root, against a build that is already being served on port 3100:
//
//   E2E_SKIP_BUILD=1 pnpm exec playwright test -c scripts/teacher-redesign/playwright.cloud.config.ts --project=teacher --workers=3
//
// Paths in a Playwright config are read from the folder the config is in, so every one is made absolute here.
import base from "../../playwright.config";

const root = process.cwd();
const launchOptions = { executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium" };
const servers = Array.isArray(base.webServer) ? base.webServer : base.webServer ? [base.webServer] : [];

const config = {
  ...base,
  testDir: `${root}/tests/e2e`,
  outputDir: `${root}/test-results`,
  use: { ...base.use, launchOptions, trace: "off" as const },
  projects: (base.projects ?? []).map((project) => ({
    ...project,
    testDir: `${root}/${project.testDir}`,
    use: { ...project.use, channel: undefined, launchOptions },
  })),
  webServer: servers.map((server) => ({ ...server, cwd: root })),
};

export default config;
