import request from "supertest";
import { createApp } from "../app.js";
import { prisma } from "../db/prisma.js";

const app = createApp();

async function makeUser(role: "INSPECTOR" | "REVIEWER" | "VIEWER" = "INSPECTOR") {
  const email = `p7user${Math.random().toString(36).slice(2, 10)}@example.com`;
  const password = "Password123!";
  await request(app).post("/api/v1/auth/register").send({ name: "P7 Tester", email, password });
  if (role !== "INSPECTOR") {
    await prisma.user.update({ where: { email }, data: { role } });
  }
  const login = await request(app).post("/api/v1/auth/login").send({ email, password });
  return { token: login.body.data.token, id: login.body.data.user.id, role };
}

// Create an inspection that already has compliance results by injecting directly
async function makeInspectionWithResults(token: string) {
  const create = await request(app)
    .post("/api/v1/inspections")
    .set("Authorization", `Bearer ${token}`)
    .send({ packageType: "RETAIL" });
  const inspectionId = create.body.data.id;

  // Inject a compliance result directly (unit-level; avoids needing the full OCR pipeline here)
  await prisma.validationResult.createMany({
    data: [
      { inspectionId, ruleId: "R6.1e", status: "FAIL", confidence: 0.8, reason: "No MRP declaration detected across analyzed images.", validatorVersion: "mrp-v1", source: "Rules 2011, Rule 6(1)(e)" },
      { inspectionId, ruleId: "R6.1c", status: "PASS", confidence: 0.9, reason: "Net quantity declared as 250 g.", validatorVersion: "quantity-v1", source: "Rules 2011, Rule 6(1)(c)" },
    ],
  });
  const results = await prisma.validationResult.findMany({ where: { inspectionId } });
  return { inspectionId, results };
}

describe("Phase 7 — human review", () => {
  it("rejects review without authentication", async () => {
    const res = await request(app).post("/api/v1/inspections/some-id/review").send({ action: "ACCEPT" });
    expect(res.status).toBe(401);
  });

  it("rejects VIEWER from reviewing", async () => {
    const owner = await makeUser();
    const { inspectionId } = await makeInspectionWithResults(owner.token);
    const viewer = await makeUser("VIEWER");
    const res = await request(app)
      .post(`/api/v1/inspections/${inspectionId}/review`)
      .set("Authorization", `Bearer ${viewer.token}`)
      .send({ action: "COMMENT", comment: "hi" });
    expect(res.status).toBe(403);
  });

  it("accepts an AI finding: human status recorded beside AI status, AI never overwritten", async () => {
    const owner = await makeUser();
    const { inspectionId, results } = await makeInspectionWithResults(owner.token);
    const failResult = results.find(r => r.ruleId === "R6.1e")!;

    const res = await request(app)
      .post(`/api/v1/inspections/${inspectionId}/review`)
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ action: "ACCEPT", targetId: failResult.id, ruleId: "R6.1e", comment: "Confirmed missing on the shelf." });
    expect(res.status).toBe(201);

    // AI status preserved; human status stored separately
    const after = await prisma.validationResult.findUnique({ where: { id: failResult.id } });
    expect(after?.status).toBe("FAIL"); // original AI status untouched
    expect(after?.humanStatus).toBe("FAIL"); // human accepted the finding
    expect(after?.humanComment).toBe("Confirmed missing on the shelf.");
    expect(after?.reviewedById).toBe(owner.id);
  });

  it("rejecting a FAIL flips the human status to PASS while the AI FAIL remains", async () => {
    const owner = await makeUser();
    const { inspectionId, results } = await makeInspectionWithResults(owner.token);
    const failResult = results.find(r => r.ruleId === "R6.1e")!;

    const res = await request(app)
      .post(`/api/v1/inspections/${inspectionId}/review`)
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ action: "REJECT", targetId: failResult.id, ruleId: "R6.1e", comment: "MRP is on the underside." });
    expect(res.status).toBe(201);

    const after = await prisma.validationResult.findUnique({ where: { id: failResult.id } });
    expect(after?.status).toBe("FAIL"); // AI result intact
    expect(after?.humanStatus).toBe("PASS"); // human override recorded
  });

  it("audits every review action with user, timestamp, old/new values, and comment", async () => {
    const owner = await makeUser();
    const { inspectionId, results } = await makeInspectionWithResults(owner.token);
    const failResult = results.find(r => r.ruleId === "R6.1e")!;

    await request(app)
      .post(`/api/v1/inspections/${inspectionId}/review`)
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ action: "ACCEPT", targetId: failResult.id, ruleId: "R6.1e", comment: "Audit check" });

    const history = await request(app)
      .get(`/api/v1/inspections/${inspectionId}/review`)
      .set("Authorization", `Bearer ${owner.token}`);
    expect(history.status).toBe(200);
    expect(history.body.data.reviews.length).toBe(1);
    const review = history.body.data.reviews[0];
    expect(review.decision).toBe("ACCEPT");
    expect(review.oldValue).toBe("FAIL");
    expect(review.newValue).toBe("FAIL");
    expect(review.reviewer.name).toBeTruthy();
    expect(history.body.data.auditLogs.length).toBeGreaterThanOrEqual(1);
  });

  it("REVIEWER role can review inspections they do not own", async () => {
    const owner = await makeUser();
    const { inspectionId, results } = await makeInspectionWithResults(owner.token);
    const reviewer = await makeUser("REVIEWER");
    const failResult = results.find(r => r.ruleId === "R6.1e")!;
    const res = await request(app)
      .post(`/api/v1/inspections/${inspectionId}/review`)
      .set("Authorization", `Bearer ${reviewer.token}`)
      .send({ action: "MARK_MANUAL", targetId: failResult.id, comment: "Needs physical check" });
    expect(res.status).toBe(201);
  });

  it("COMMENT action records a note without touching any result", async () => {
    const owner = await makeUser();
    const { inspectionId } = await makeInspectionWithResults(owner.token);
    const res = await request(app)
      .post(`/api/v1/inspections/${inspectionId}/review`)
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ action: "COMMENT", comment: "Package retrieved from shelf B." });
    expect(res.status).toBe(201);
    const count = await prisma.validationResult.count({ where: { inspectionId, humanStatus: { not: null } } });
    expect(count).toBe(0);
  });

  it("resolving a REVIEW finding to PASS or FAIL preserves the original AI REVIEW status (Refinement 2C)", async () => {
    const owner = await makeUser();
    
    // Create an inspection with a REVIEW finding
    const create = await request(app)
      .post("/api/v1/inspections")
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ packageType: "RETAIL" });
    const inspectionId = create.body.data.id;

    await prisma.validationResult.create({
      data: {
        inspectionId, 
        ruleId: "R14", 
        status: "REVIEW", 
        confidence: 0.45, 
        reason: "Image quality insufficient.", 
        validatorVersion: "dimensions-v1", 
        source: "Rule 14"
      },
    });

    const results = await prisma.validationResult.findMany({ where: { inspectionId } });
    const reviewResult = results.find(r => r.ruleId === "R14")!;

    // Resolve it to PASS using CHANGE_RESULT
    const res = await request(app)
      .post(`/api/v1/inspections/${inspectionId}/review`)
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ action: "CHANGE_RESULT", newValue: "PASS", targetId: reviewResult.id, ruleId: "R14", comment: "Verified manually, it passes." });
    
    expect(res.status).toBe(201);

    const after = await prisma.validationResult.findUnique({ where: { id: reviewResult.id } });
    expect(after?.status).toBe("REVIEW"); // original AI status remains REVIEW
    expect(after?.humanStatus).toBe("PASS"); // human override recorded
    expect(after?.humanComment).toBe("Verified manually, it passes.");
  });

  it("updates the aggregate overallResult when humanStatus changes", async () => {
    const owner = await makeUser();
    
    // Create an inspection
    const create = await request(app)
      .post("/api/v1/inspections")
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ packageType: "RETAIL" });
    const inspectionId = create.body.data.id;

    // Inject compliance results: 1 PASS, 1 REVIEW
    await prisma.validationResult.createMany({
      data: [
        { inspectionId, ruleId: "R6.1e", status: "PASS", confidence: 0.9, reason: "ok", validatorVersion: "v1" },
        { inspectionId, ruleId: "R14", status: "REVIEW", confidence: 0.45, reason: "maybe", validatorVersion: "v1" },
      ],
    });
    // Set initial overallResult
    await prisma.inspection.update({ where: { id: inspectionId }, data: { overallResult: "REVIEW" } });

    const results = await prisma.validationResult.findMany({ where: { inspectionId } });
    const reviewResult = results.find(r => r.ruleId === "R14")!;

    // Resolve the REVIEW to PASS
    await request(app)
      .post(`/api/v1/inspections/${inspectionId}/review`)
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ action: "CHANGE_RESULT", newValue: "PASS", targetId: reviewResult.id, ruleId: "R14" });
    
    // The aggregate overallResult should now be PASS because both effective statuses are PASS
    const inspAfterPass = await prisma.inspection.findUnique({ where: { id: inspectionId } });
    expect(inspAfterPass?.overallResult).toBe("PASS");

    // Now change it to FAIL
    await request(app)
      .post(`/api/v1/inspections/${inspectionId}/review`)
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ action: "CHANGE_RESULT", newValue: "FAIL", targetId: reviewResult.id, ruleId: "R14" });

    // The aggregate overallResult should now be FAIL
    const inspAfterFail = await prisma.inspection.findUnique({ where: { id: inspectionId } });
    expect(inspAfterFail?.overallResult).toBe("FAIL");
  });
});
