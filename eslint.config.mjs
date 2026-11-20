import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Worktrees of helper agents (Claude Code).
    ".claude/**",
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated files and reports:
    "public/sw.js",
    ".lighthouseci/**",
    "playwright-report/**",
    "test-results/**",
    "docs/**",
  ]),
]);

export default eslintConfig;
