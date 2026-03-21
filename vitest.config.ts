import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    dir: "./tests",
    exclude: ["**/node_modules/**", "**/*.spec.ts"],
    setupFiles: ["./tests/api/setup.ts"],
    testTimeout: 10000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
