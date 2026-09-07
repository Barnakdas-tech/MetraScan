import { execSync } from "node:child_process";
import { prisma } from "../db/prisma.js";

// Test database — separate from the dev database.
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgresql://barnakdas@localhost:5432/metrascan_test";

// Must be set BEFORE any module imports @prisma/client, so the generated
// client binds to the test database.
process.env.DATABASE_URL = TEST_DATABASE_URL;
process.env.JWT_SECRET = "test-secret-not-for-production-use";
process.env.API_PORT = "0";
process.env.NODE_ENV = "test";

export { TEST_DATABASE_URL };

// Reset the schema ONCE per worker. Spawning the Prisma CLI before every
// single test was slow enough to blow the 10s hook timeout and made runs flaky.
execSync(
  `npx prisma db push --force-reset --skip-generate --accept-data-loss --schema prisma/schema.prisma`,
  { stdio: "pipe", env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL } }
);

beforeEach(async () => {
  // Per-test isolation: fast truncate instead of a CLI spawn. CASCADE wipes
  // every row including InspectionCounter, so inspection numbers restart at 1.
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE "User", "Inspection", "InspectionCounter", "InspectionImage", "OcrResult", "OcrRegion", "Product", "Declaration", "Rule", "RuleVersion", "ValidationResult", "Violation", "Evidence", "Review", "Report", "AuditLog" RESTART IDENTITY CASCADE`
  );
});

afterAll(async () => {
  await prisma.$disconnect();
});
