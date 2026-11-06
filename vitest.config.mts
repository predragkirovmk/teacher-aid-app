import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// The demo's timetable is local-time arithmetic; run the tests in the school's zone so the daylight
// saving change of 25 Oct 2026 is inside the weeks they cover, whatever machine they run on.
process.env.TZ = "Europe/Skopje";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: {
    include: ["tests/unit/**/*.test.{ts,tsx}"],
    // Pure logic runs in plain Node; a test that needs localStorage or React DOM opts in to jsdom
    // with a `// @vitest-environment jsdom` line.
    environment: "node",
  },
});
