import { prisma } from "../db/prisma.js";

/**
 * Generates the human-readable inspection number INS-YYYY-NNNNNN with a
 * per-year sequential counter, safe under concurrency via a Postgres
 * advisory lock. The number is a display/business field — never a primary key.
 */
export async function generateInspectionNumber(year: number): Promise<string> {
  await prisma.$executeRaw`SELECT pg_advisory_lock(hashtext('metrascan:inspection-number'))`;
  try {
    const rows = await prisma.$queryRaw<Array<{ year: number; lastNumber: bigint }>>`
      INSERT INTO "InspectionCounter" ("year", "lastNumber") VALUES (${year}, 1)
      ON CONFLICT ("year") DO UPDATE SET "lastNumber" = "InspectionCounter"."lastNumber" + 1
      RETURNING "lastNumber"
    `;
    const n = rows[0]?.lastNumber ?? 1n;
    return `INS-${year}-${String(n).padStart(6, "0")}`;
  } finally {
    await prisma.$executeRaw`SELECT pg_advisory_unlock(hashtext('metrascan:inspection-number'))`;
  }
}
