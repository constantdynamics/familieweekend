import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      // server-only throws outside React Server Components; tests run in Node.
      "server-only": path.resolve(import.meta.dirname, "tests/support/empty.ts"),
    },
  },
  test: {
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    environment: "node",
    env: {
      APP_SECRET: "test-secret-voor-vitest-dat-lang-genoeg-is-0123456789",
      TZ: "UTC",
    },
  },
});
