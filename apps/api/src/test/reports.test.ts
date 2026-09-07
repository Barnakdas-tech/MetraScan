import request from "supertest";
import { createApp } from "../app.js";
import { prisma } from "../db/prisma.js";
import { generateReport } from "../services/reportService.js";

const app = createApp();

async function makeUser(role: "INSPECTOR" | "REVIEWER" | "ADMIN" = "INSPECTOR") {
  const email = `reportuser${Math.random().toString(36).slice(2, 10)}@example.com`;
  const password = "Password123!";
  await request(app).post("/api/v1/auth/register").send({ name: "Report Tester", email, password });
  if (role !== "INSPECTOR") {
    await prisma.user.update({ where: { email }, data: { role } });
  }
  const login = await request(app).post("/api/v1/auth/login").send({ email, password });
  return { token: login.body.data.token, id: login.body.data.user.id };
}

describe("Reports API", () => {
  it("requires authentication", async () => {
    const res = await request(app).get("/api/v1/reports");
    expect(res.status).toBe(401);
  });

  it("returns a list of historical reports and handles authorization and distinct PDFs", async () => {
    const inspector1 = await makeUser("INSPECTOR");
    const inspector2 = await makeUser("INSPECTOR");
    const admin = await makeUser("ADMIN");

    // Create inspection 1 for inspector 1
    const insp1 = await prisma.inspection.create({
      data: {
        inspectionNumber: `INS-REPORT-${Math.random()}`,
        year: 2026,
        status: "COMPLETED",
        inspectorId: inspector1.id,
        packageType: "RETAIL",
        intendedConsumer: "RETAIL",
        overallResult: "PASS"
      }
    });

    await prisma.validationResult.create({
      data: {
        inspectionId: insp1.id,
        ruleId: "R6.1a",
        status: "PASS",
        reason: "Looks good"
      }
    });

    // Create inspection 2 for inspector 1
    const insp2 = await prisma.inspection.create({
      data: {
        inspectionNumber: `INS-REPORT-${Math.random()}`,
        year: 2026,
        status: "COMPLETED",
        inspectorId: inspector1.id,
        packageType: "RETAIL",
        intendedConsumer: "RETAIL",
        overallResult: "FAIL"
      }
    });

    // Generate reports
    await generateReport(insp1.id, { sub: inspector1.id, role: "INSPECTOR" });
    await generateReport(insp2.id, { sub: inspector1.id, role: "INSPECTOR" });

    // 1. Verify GET /api/v1/reports returns BOTH reports for inspector 1
    const res1 = await request(app)
      .get("/api/v1/reports")
      .set("Authorization", `Bearer ${inspector1.token}`);
      
    expect(res1.status).toBe(200);
    expect(res1.body.data.length).toBeGreaterThanOrEqual(2);
    
    // Check that we got both reports
    const rep1 = res1.body.data.find((r: any) => r.inspectionId === insp1.id);
    const rep2 = res1.body.data.find((r: any) => r.inspectionId === insp2.id);
    expect(rep1).toBeDefined();
    expect(rep2).toBeDefined();
    expect(rep1.reportId).not.toBe(rep2.reportId);

    // 2. Verify Authorization: inspector 2 cannot see inspector 1's reports
    const res2 = await request(app)
      .get("/api/v1/reports")
      .set("Authorization", `Bearer ${inspector2.token}`);
    
    expect(res2.status).toBe(200);
    const rep1ForUser2 = res2.body.data.find((r: any) => r.inspectionId === insp1.id);
    expect(rep1ForUser2).toBeUndefined(); // Should not see it

    // Inspector 2 should get 403 or 404 if trying to download inspector 1's report
    const dlFail = await request(app)
      .get(`/api/v1/reports/${rep1.reportId}/download`)
      .set("Authorization", `Bearer ${inspector2.token}`);
    expect(dlFail.status).toBe(404); // Our API returns 404 if not found or no access

    // 3. Verify Admin can see them
    const resAdmin = await request(app)
      .get("/api/v1/reports")
      .set("Authorization", `Bearer ${admin.token}`);
    expect(resAdmin.body.data.find((r: any) => r.inspectionId === insp1.id)).toBeDefined();

    // 4. Verify distinct PDFs and inline/attachment headers
    
    // Explicitly verify mapping via database
    const dbRep1 = await prisma.report.findUnique({ where: { id: rep1.reportId } });
    const dbRep2 = await prisma.report.findUnique({ where: { id: rep2.reportId } });
    
    expect(dbRep1).toBeDefined();
    expect(dbRep2).toBeDefined();
    expect(dbRep1?.inspectionId).toBe(insp1.id);
    expect(dbRep2?.inspectionId).toBe(insp2.id);
    expect(dbRep1?.storageKey).toBeDefined();
    expect(dbRep2?.storageKey).toBeDefined();
    expect(dbRep1?.storageKey).not.toBe(dbRep2?.storageKey);

    const dl1 = await request(app)
      .get(`/api/v1/reports/${rep1.reportId}/download`)
      .set("Authorization", `Bearer ${inspector1.token}`);
    expect(dl1.status).toBe(200);
    expect(dl1.headers["content-type"]).toBe("application/pdf");
    expect(dl1.headers["content-disposition"]).toContain("attachment");

    const dl1Inline = await request(app)
      .get(`/api/v1/reports/${rep1.reportId}/download?inline=true`)
      .set("Authorization", `Bearer ${inspector1.token}`);
    expect(dl1Inline.status).toBe(200);
    expect(dl1Inline.headers["content-disposition"]).toContain("inline");

    const dl2 = await request(app)
      .get(`/api/v1/reports/${rep2.reportId}/download`)
      .set("Authorization", `Bearer ${inspector1.token}`);
    expect(dl2.status).toBe(200);
    
    // Ensure the two PDFs are different (not returning the exact same bytes)
    expect(dl1.body.length).not.toEqual(dl2.body.length);
  });
});
