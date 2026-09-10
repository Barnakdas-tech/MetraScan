import request from "supertest";
import { createApp } from "../app.js";
import { prisma } from "../db/prisma.js";

const app = createApp();

async function makeUser(role: "INSPECTOR" | "REVIEWER" | "VIEWER" | "ADMIN" = "INSPECTOR") {
  const email = `p7user${Math.random().toString(36).slice(2, 10)}@example.com`;
  const password = "Password123!";
  await request(app).post("/api/v1/auth/register").send({ name: "P7 Tester", email, password });
  if (role !== "INSPECTOR") {
    await prisma.user.update({ where: { email }, data: { role } });
  }
  const login = await request(app).post("/api/v1/auth/login").send({ email, password });
  return { token: login.body.data.token, id: login.body.data.user.id, role };
}

async function makeInspectionWithResults(ownerToken: string) {
  const create = await request(app)
    .post("/api/v1/inspections")
    .set("Authorization", `Bearer ${ownerToken}`)
    .send({ packageType: "RETAIL" });
  const inspectionId = create.body.data.id;
  await prisma.validationResult.createMany({
    data: [
      { inspectionId, ruleId: "R6.1e", status: "FAIL", confidence: 0.8, reason: "No MRP.", validatorVersion: "mrp-v1" },
      { inspectionId, ruleId: "R6.1c", status: "PASS", confidence: 0.9, reason: "Qty ok.", validatorVersion: "quantity-v1" },
    ],
  });
  const results = await prisma.validationResult.findMany({ where: { inspectionId } });
  return { inspectionId, results };
}

describe("Phase 7 human review (separation of duties)", () => {
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

  it("blocks an inspector from reviewing their OWN inspection", async () => {
    const owner = await makeUser();
    const { inspectionId, results } = await makeInspectionWithResults(owner.token);
    const failResult = results.find(r => r.ruleId === "R6.1e")!;
    const res = await request(app)
      .post(`/api/v1/inspections/${inspectionId}/review`)
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ action: "REJECT", targetId: failResult.id, ruleId: "R6.1e", comment: "MRP is on the underside." });
    expect(res.status).toBe(403);
    expect(res.body.error.message).toMatch(/Separation of duties/i);
    const after = await prisma.validationResult.findUnique({ where: { id: failResult.id } });
    expect(after?.humanStatus).toBeNull();
  });

  it("blocks a DIFFERENT inspector from reviewing another inspector's inspection", async () => {
    const owner = await makeUser();
    const { inspectionId, results } = await makeInspectionWithResults(owner.token);
    const failResult = results.find(r => r.ruleId === "R6.1e")!;
    const other = await makeUser("INSPECTOR");
    const res = await request(app)
      .post(`/api/v1/inspections/${inspectionId}/review`)
      .set("Authorization", `Bearer ${other.token}`)
      .send({ action: "ACCEPT", targetId: failResult.id, ruleId: "R6.1e" });
    // 404 (existence hidden) or 403 both deny the action.
    expect([403, 404]).toContain(res.status);
  });

  it("allows a REVIEWER to reject a FAIL on another inspector's inspection, preserving AI status", async () => {
    const owner = await makeUser();
    const { inspectionId, results } = await makeInspectionWithResults(owner.token);
    const failResult = results.find(r => r.ruleId === "R6.1e")!;
    const reviewer = await makeUser("REVIEWER");
    const res = await request(app)
      .post(`/api/v1/inspections/${inspectionId}/review`)
      .set("Authorization", `Bearer ${reviewer.token}`)
      .send({ action: "REJECT", targetId: failResult.id, ruleId: "R6.1e", comment: "MRP is on the underside." });
    expect(res.status).toBe(201);
    const after = await prisma.validationResult.findUnique({ where: { id: failResult.id } });
    expect(after?.status).toBe("FAIL");
    expect(after?.humanStatus).toBe("PASS");
    expect(after?.reviewedById).toBe(reviewer.id);
  });

  it("allows ADMIN to review (explicit policy) and records the action", async () => {
    const owner = await makeUser();
    const { inspectionId, results } = await makeInspectionWithResults(owner.token);
    const failResult = results.find(r => r.ruleId === "R6.1e")!;
    const admin = await makeUser("ADMIN");
    const res = await request(app)
      .post(`/api/v1/inspections/${inspectionId}/review`)
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ action: "MARK_MANUAL", targetId: failResult.id, comment: "Needs physical check" });
    expect(res.status).toBe(201);
    const after = await prisma.validationResult.findUnique({ where: { id: failResult.id } });
    expect(after?.humanStatus).toBe("MANUAL_REQUIRED");
  });

  it("rejects an invalid newValue enum value", async () => {
    const owner = await makeUser();
    const { inspectionId, results } = await makeInspectionWithResults(owner.token);
    const reviewer = await makeUser("REVIEWER");
    const res = await request(app)
      .post(`/api/v1/inspections/${inspectionId}/review`)
      .set("Authorization", `Bearer ${reviewer.token}`)
      .send({ action: "CHANGE_RESULT", newValue: "HACKED_VALUE", targetId: results[0].id, ruleId: "R6.1e" });
    expect(res.status).toBe(400);
  });

  it("rejects cross-inspection targetId manipulation", async () => {
    const ownerA = await makeUser();
    const { inspectionId: inspA } = await makeInspectionWithResults(ownerA.token);
    const ownerB = await makeUser();
    const { results: resultsB } = await makeInspectionWithResults(ownerB.token);
    const reviewer = await makeUser("REVIEWER");
    const res = await request(app)
      .post(`/api/v1/inspections/${inspA}/review`)
      .set("Authorization", `Bearer ${reviewer.token}`)
      .send({ action: "ACCEPT", targetId: resultsB[0].id, ruleId: "R6.1e" });
    expect(res.status).toBe(404);
  });

  it("REVIEWER CHANGE_RESULT resolves REVIEW to PASS, preserving AI status", async () => {
    const owner = await makeUser();
    const create = await request(app)
      .post("/api/v1/inspections")
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ packageType: "RETAIL" });
    const inspectionId = create.body.data.id;
    const revResult = await prisma.validationResult.create({
      data: { inspectionId, ruleId: "R14", status: "REVIEW", confidence: 0.45, reason: "Image quality insufficient.", validatorVersion: "dimensions-v1" },
    });
    const reviewer = await makeUser("REVIEWER");
    const res = await request(app)
      .post(`/api/v1/inspections/${inspectionId}/review`)
      .set("Authorization", `Bearer ${reviewer.token}`)
      .send({ action: "CHANGE_RESULT", newValue: "PASS", targetId: revResult.id, ruleId: "R14", comment: "Verified manually." });
    expect(res.status).toBe(201);
    const after = await prisma.validationResult.findUnique({ where: { id: revResult.id } });
    expect(after?.status).toBe("REVIEW");
    expect(after?.humanStatus).toBe("PASS");
  });

  it("updates the aggregate overallResult when a REVIEWER changes humanStatus", async () => {
    const owner = await makeUser();
    const create = await request(app)
      .post("/api/v1/inspections")
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ packageType: "RETAIL" });
    const inspectionId = create.body.data.id;
    await prisma.validationResult.createMany({
      data: [
        { inspectionId, ruleId: "R6.1e", status: "PASS", confidence: 0.9, reason: "ok", validatorVersion: "v1" },
        { inspectionId, ruleId: "R14", status: "REVIEW", confidence: 0.45, reason: "maybe", validatorVersion: "v1" },
      ],
    });
    await prisma.inspection.update({ where: { id: inspectionId }, data: { overallResult: "REVIEW" } });
    const results = await prisma.validationResult.findMany({ where: { inspectionId } });
    const reviewResult = results.find(r => r.ruleId === "R14")!;
    const reviewer = await makeUser("REVIEWER");
    await request(app)
      .post(`/api/v1/inspections/${inspectionId}/review`)
      .set("Authorization", `Bearer ${reviewer.token}`)
      .send({ action: "CHANGE_RESULT", newValue: "PASS", targetId: reviewResult.id, ruleId: "R14" });
    const inspAfterPass = await prisma.inspection.findUnique({ where: { id: inspectionId } });
    expect(inspAfterPass?.overallResult).toBe("PASS");
    await request(app)
      .post(`/api/v1/inspections/${inspectionId}/review`)
      .set("Authorization", `Bearer ${reviewer.token}`)
      .send({ action: "CHANGE_RESULT", newValue: "FAIL", targetId: reviewResult.id, ruleId: "R14" });
    const inspAfterFail = await prisma.inspection.findUnique({ where: { id: inspectionId } });
    expect(inspAfterFail?.overallResult).toBe("FAIL");
  });
});
