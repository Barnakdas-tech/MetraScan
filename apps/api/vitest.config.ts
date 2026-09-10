import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    // Schema reset happens ONCE in globalSetup (before any worker starts);
    // per-test isolation comes from setup.ts's TRUNCATE. Without this split,
    // every worker raced prisma db push --force-reset and destroyed the
    // schema mid-suite ("Role already exists", "schema concurrently dropped").
    globalSetup: "./src/test/global-setup.ts",
    setupFiles: ["./src/test/setup.ts"],
    testTimeout: 30000,
    // Never pick up compiled output as test files.
    exclude: ["**/dist/**", "**/node_modules/**", "**/src/generated/**"],
    // Sequential execution: the suite shares one test database, so only one
    // test file may run at a time.
    fileParallelism: false,
  },
});
