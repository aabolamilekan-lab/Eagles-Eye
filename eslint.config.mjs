import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // AGENTS.md: no stray debugging output in committed code.
      "no-console": ["error", { allow: ["error", "warn"] }],
      // AGENTS.md: no unused exports or dead code left behind.
      //
      // The base rule reports false positives on parameter names that only
      // exist inside TypeScript function *types* (`(target: number) => string`),
      // because it has no type information. The typescript-eslint rule is the
      // aware one, so it owns this job and the base rule is switched off.
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      eqeqeq: ["error", "smart"],
      "prefer-const": "error",
      "no-var": "error",
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "node_modules/**",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
  ]),
]);

export default eslintConfig;