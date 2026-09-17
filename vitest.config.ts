import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname),
    },
  },
  test: {
    environment: "node",
    globals: false,
    include: ["**/*.test.ts"],
    // `output: standalone` copies the whole project into .next/standalone,
    // build output included, so every test file would otherwise be collected
    // twice — once live, once from a stale copy.
    exclude: ["**/node_modules/**", "**/.next/**", "**/e2e/**"],
    restoreMocks: true,
    clearMocks: true,
    coverage: {
      reporter: ["text", "html"],
      reportsDirectory: "coverage/unit",
    },
  },
});
