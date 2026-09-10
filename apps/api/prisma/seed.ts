import { PrismaClient } from "../src/generated/prisma/index.js";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

/**
 * DEMO SEED — creates clearly-labeled demo data for the hackathon golden path.
 * Every seeded inspection carries isDemo=true and a visible "DEMO" label so it
 * can never be mistaken for real enforcement data.
 */
async function main() {
  console.log("Seeding DEMO data (clearly labeled)...");

  // Demo inspector account (change the password before any public demo)
  const demoEmail = process.env.SEED_ADMIN_EMAIL;
  const demoPassword = process.env.SEED_ADMIN_PASSWORD;
  if (!demoEmail || !demoPassword) {
    console.error(
      "SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD are required. Refusing to seed with default credentials."
    );
    process.exit(1);
  }
  const passwordHash = await bcrypt.hash(demoPassword, 12);
  const demoUser = await prisma.user.upsert({
    where: { email: demoEmail },
    update: {},
    create: { email: demoEmail, name: "Demo Inspector", passwordHash, role: "INSPECTOR" },
  });

  // A demo product + inspection, clearly flagged
  const product = await prisma.product.upsert({
    where: { id: "00000000-0000-0000-0000-000000000001" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000001",
      name: "DEMO Marie Gold Tea Biscuits",
      brand: "DEMO Britannia",
      category: "food",
      categoryConfidence: 0.9,
      categorySource: "keyword-heuristic",
    },
  });

  const existing = await prisma.inspection.findFirst({ where: { isDemo: true, inspectorId: demoUser.id } });
  if (existing) {
    console.log("Demo inspection already present — skipping duplicate seed.");
  } else {
    const demoDate = new Date();
    const inspection = await prisma.inspection.create({
      data: {
        inspectionNumber: "DEMO-2026-000001",
        status: "DRAFT",
        inspectorId: demoUser.id,
        productId: product.id,
        packageType: "RETAIL",
        intendedConsumer: "RETAIL",
        inspectionDate: demoDate,
        year: demoDate.getFullYear(),
        location: "DEMO — Market Stall 12 (demo data)",
        notes: "DEMO inspection for the judge walkthrough. Not real enforcement data.",
        isDemo: true,
        demoLabel: "DEMO",
      },
    });
    console.log("Created demo inspection:", inspection.inspectionNumber);
  }

  console.log("Demo seed complete. Login with:", demoEmail);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
