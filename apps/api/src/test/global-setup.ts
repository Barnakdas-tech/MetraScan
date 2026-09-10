import { execSync } from "node:child_process";

// Runs ONCE before any test worker starts. Resets the test database schema
// so each suite run begins from a clean, fully-migrated state.
const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://barnakdas@localhost:5432/metrascan_test";

process.env.DATABASE_URL = TEST_DATABASE_URL;

export default function globalSetup() {
  execSync(
    "npx prisma db push --force-reset --skip-generate --accept-data-loss --schema prisma/schema.prisma",
    { stdio: "pipe", env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL }, cwd: process.cwd() }
  );
}
