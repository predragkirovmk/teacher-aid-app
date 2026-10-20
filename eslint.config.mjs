import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // The student app reads its data through the API hooks. The mock adapter's fixtures, store and
  // session driver (lib/app/api/mock) belong to the adapter; the demo-only module (lib/app/demo) is
  // for code that checks `demoOnly` first.
  {
    files: ["app/(app)/**/*.{ts,tsx}", "components/app/**/*.{ts,tsx}", "lib/app/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/api/mock", "**/api/mock/*"],
              message: "Screens read data through the hooks in lib/app/api/hooks, never from the mock adapter's modules.",
            },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    // Build and test output.
    ".next-live/**",
    "playwright-report/**",
    "test-results/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
