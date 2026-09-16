import request from "supertest";
import { describe, it, expect } from "vitest";
import { createApp } from "../app.js";
import { prisma } from "../db/prisma.js";

const app = createApp();

async function makeUser(role: "INSPECTOR" | "REVIEWER" | "VIEWER" | "ADMIN" = "INSPECTOR") {
  const email = `role_${role.toLowerCase()}_${Math.random().toString(36).slice(2, 10)}@example.com`;
  const password = "Password123!";
  await request(app).post("/api/v1/auth/register").send({ name: `${role} User`, email, password });
  if (role !== "INSPECTOR") {
    await prisma.user.update({ where: { email }, data: { role } });
  }
  const login = await request(app).post("/api/v1/auth/login").send({ email, password });
  return { token: login.body.data.token, id: login.body.data.user.id, email, password, role };
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

describe("Role-Based Inspection -> Review -> Final Decision Workflow", () => {
  // 1. Inspector can create inspection
  it("allows Inspector to create an inspection and audits INSPECTION_CREATED", async () => {
    const inspector = await makeUser("INSPECTOR");
    const res = await request(app)
      .post("/api/v1/inspections")
      .set("Authorization", `Bearer ${inspector.token}`)
      .send({ packageType: "RETAIL", location: "Warehouse A" });

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe("DRAFT");
    expect(res.body.data.inspectorId).toBe(inspector.id);

    const auditEntry = await prisma.auditLog.findFirst({
      where: { action: "INSPECTION_CREATED", entityId: res.body.data.id },
    });
    expect(auditEntry).not.toBeNull();
    expect(auditEntry?.actorId).toBe(inspector.id);
  });

  // 2. Inspector cannot perform final review decision on own inspection (separation of duties)
  it("strictly prevents Inspector from performing a final review decision on their OWN inspection", async () => {
    const inspector = await makeUser("INSPECTOR");
    const { inspectionId, results } = await makeInspectionWithResults(inspector.token);
    const failResult = results.find(r => r.ruleId === "R6.1e")!;

    const res = await request(app)
      .post(`/api/v1/inspections/${inspectionId}/review`)
      .set("Authorization", `Bearer ${inspector.token}`)
      .send({ action: "ACCEPT", targetId: failResult.id, ruleId: "R6.1e" });

    expect(res.status).toBe(403);
    expect(res.body.error.message).toMatch(/Separation of duties/i);

    const after = await prisma.validationResult.findUnique({ where: { id: failResult.id } });
    expect(after?.humanStatus).toBeNull();
  });

  // 3. Inspector cannot review another inspector's case
  it("blocks an Inspector from reviewing another inspector's inspection", async () => {
    const inspectorA = await makeUser("INSPECTOR");
    const { inspectionId, results } = await makeInspectionWithResults(inspectorA.token);
    const failResult = results.find(r => r.ruleId === "R6.1e")!;

    const inspectorB = await makeUser("INSPECTOR");
    const res = await request(app)
      .post(`/api/v1/inspections/${inspectionId}/review`)
      .set("Authorization", `Bearer ${inspectorB.token}`)
      .send({ action: "REJECT", targetId: failResult.id, ruleId: "R6.1e" });

    expect([403, 404]).toContain(res.status);
  });

  // Inspector can submit for review
  it("allows owning Inspector to submit inspection for review, transitioning status to UNDER_REVIEW", async () => {
    const inspector = await makeUser("INSPECTOR");
    const { inspectionId } = await makeInspectionWithResults(inspector.token);

    const res = await request(app)
      .post(`/api/v1/inspections/${inspectionId}/submit-for-review`)
      .set("Authorization", `Bearer ${inspector.token}`)
      .send({ comment: "Uncertain label font height" });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("UNDER_REVIEW");

    const auditEntry = await prisma.auditLog.findFirst({
      where: { action: "SUBMITTED_FOR_REVIEW", entityId: inspectionId },
    });
    expect(auditEntry).not.toBeNull();
    expect(auditEntry?.actorId).toBe(inspector.id);

    // Another inspector cannot submit it
    const otherInspector = await makeUser("INSPECTOR");
    const otherRes = await request(app)
      .post(`/api/v1/inspections/${inspectionId}/submit-for-review`)
      .set("Authorization", `Bearer ${otherInspector.token}`)
      .send({ comment: "Hacked submission" });
    expect(otherRes.status).toBe(403);
  });

  // 4 & 5. Reviewer can accept and reject a review case
  it("allows Reviewer to ACCEPT or REJECT findings, recording decisions beside AI evidence", async () => {
    const inspector = await makeUser("INSPECTOR");
    const { inspectionId, results } = await makeInspectionWithResults(inspector.token);
    const failResult = results.find(r => r.ruleId === "R6.1e")!;
    const reviewer = await makeUser("REVIEWER");

    // REJECT AI fail (meaning reviewer considers it PASS)
    const rejectRes = await request(app)
      .post(`/api/v1/inspections/${inspectionId}/review`)
      .set("Authorization", `Bearer ${reviewer.token}`)
      .send({ action: "REJECT", targetId: failResult.id, ruleId: "R6.1e", comment: "MRP found on base panel" });

    expect(rejectRes.status).toBe(201);
    const afterReject = await prisma.validationResult.findUnique({ where: { id: failResult.id } });
    expect(afterReject?.status).toBe("FAIL"); // original AI status preserved!
    expect(afterReject?.humanStatus).toBe("PASS"); // human override recorded!
    expect(afterReject?.reviewedById).toBe(reviewer.id);

    // Now ACCEPT AI pass on R6.1c
    const passResult = results.find(r => r.ruleId === "R6.1c")!;
    const acceptRes = await request(app)
      .post(`/api/v1/inspections/${inspectionId}/review`)
      .set("Authorization", `Bearer ${reviewer.token}`)
      .send({ action: "ACCEPT", targetId: passResult.id, ruleId: "R6.1c" });

    expect(acceptRes.status).toBe(201);
    const afterAccept = await prisma.validationResult.findUnique({ where: { id: passResult.id } });
    expect(afterAccept?.status).toBe("PASS");
    expect(afterAccept?.humanStatus).toBe("PASS");
  });

  // 6. Reviewer can change result
  it("allows Reviewer to explicitly CHANGE_RESULT on a finding", async () => {
    const inspector = await makeUser("INSPECTOR");
    const { inspectionId, results } = await makeInspectionWithResults(inspector.token);
    const targetResult = results[0];
    const reviewer = await makeUser("REVIEWER");

    const res = await request(app)
      .post(`/api/v1/inspections/${inspectionId}/review`)
      .set("Authorization", `Bearer ${reviewer.token}`)
      .send({
        action: "CHANGE_RESULT",
        targetId: targetResult.id,
        ruleId: targetResult.ruleId,
        newValue: "MANUAL_REQUIRED",
        comment: "Requires micrometer measurement",
      });

    expect(res.status).toBe(201);
    const after = await prisma.validationResult.findUnique({ where: { id: targetResult.id } });
    expect(after?.humanStatus).toBe("MANUAL_REQUIRED");
  });

  // 7 & 8. Reviewer can edit declaration and original AI evidence is preserved
  it("allows Reviewer to correct a declaration, preserving rawText and normalizedValue", async () => {
    const inspector = await makeUser("INSPECTOR");
    const { inspectionId } = await makeInspectionWithResults(inspector.token);

    const decl = await prisma.declaration.create({
      data: {
        inspectionId,
        field: "mrp",
        rawText: "M.R.P. Rs. 50.00",
        normalizedValue: "50",
        currency: "INR",
        extractionConfidence: 0.95,
      },
    });

    const reviewer = await makeUser("REVIEWER");
    const patchRes = await request(app)
      .patch(`/api/v1/inspections/${inspectionId}/declarations/${decl.id}`)
      .set("Authorization", `Bearer ${reviewer.token}`)
      .send({
        correctedValue: "45",
        correctionNote: "Special promo sticker applied",
      });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.data.correctedValue).toBe("45");
    expect(patchRes.body.data.rawText).toBe("M.R.P. Rs. 50.00"); // preserved!
    expect(patchRes.body.data.normalizedValue).toBe("50"); // preserved!

    const fromDb = await prisma.declaration.findUnique({ where: { id: decl.id } });
    expect(fromDb?.rawText).toBe("M.R.P. Rs. 50.00");
    expect(fromDb?.normalizedValue).toBe("50");
    expect(fromDb?.correctedValue).toBe("45");
    expect(fromDb?.correctedById).toBe(reviewer.id);

    const auditEntry = await prisma.auditLog.findFirst({
      where: { action: "DECLARATION_CORRECTED", entityId: decl.id },
    });
    expect(auditEntry).not.toBeNull();
  });

  // 9, 10, 11. Viewer cannot submit review, modify declarations, or manage users
  it("denies VIEWER role from review actions, declaration editing, and user management (403)", async () => {
    const inspector = await makeUser("INSPECTOR");
    const { inspectionId, results } = await makeInspectionWithResults(inspector.token);
    const viewer = await makeUser("VIEWER");

    // 9. Viewer cannot review
    const revRes = await request(app)
      .post(`/api/v1/inspections/${inspectionId}/review`)
      .set("Authorization", `Bearer ${viewer.token}`)
      .send({ action: "COMMENT", comment: "Hello" });
    expect(revRes.status).toBe(403);

    // 10. Viewer cannot modify declaration
    const decl = await prisma.declaration.create({
      data: { inspectionId, field: "netQuantity", rawText: "500 g", normalizedValue: "500", unit: "g" },
    });
    const declRes = await request(app)
      .patch(`/api/v1/inspections/${inspectionId}/declarations/${decl.id}`)
      .set("Authorization", `Bearer ${viewer.token}`)
      .send({ correctedValue: "600" });
    expect(declRes.status).toBe(403);

    // 11. Viewer cannot manage users
    const userRes = await request(app)
      .get("/api/v1/users")
      .set("Authorization", `Bearer ${viewer.token}`);
    expect(userRes.status).toBe(403);
  });

  // 12. Admin can review cases
  it("allows Admin to review cases and resolve findings", async () => {
    const inspector = await makeUser("INSPECTOR");
    const { inspectionId, results } = await makeInspectionWithResults(inspector.token);
    const failResult = results.find(r => r.ruleId === "R6.1e")!;
    const admin = await makeUser("ADMIN");

    const res = await request(app)
      .post(`/api/v1/inspections/${inspectionId}/review`)
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ action: "ACCEPT", targetId: failResult.id, ruleId: "R6.1e", comment: "Admin confirmed" });

    expect(res.status).toBe(201);
    const after = await prisma.validationResult.findUnique({ where: { id: failResult.id } });
    expect(after?.humanStatus).toBe("FAIL");
    expect(after?.reviewedById).toBe(admin.id);
  });

  // 13. Admin can manage users with self-lockout prevention
  it("allows Admin to list, create, change role, and deactivate users, but blocks self-demotion and self-deactivation", async () => {
    const admin = await makeUser("ADMIN");

    // List users
    const listRes = await request(app)
      .get("/api/v1/users")
      .set("Authorization", `Bearer ${admin.token}`);
    expect(listRes.status).toBe(200);
    expect(Array.isArray(listRes.body.data)).toBe(true);
    expect(listRes.body.data[0].passwordHash).toBeUndefined(); // never expose passwordHash!

    // Create user
    const newEmail = `created_${Math.random().toString(36).slice(2, 8)}@example.com`;
    const createRes = await request(app)
      .post("/api/v1/users")
      .set("Authorization", `Bearer ${admin.token}`)
      .send({
        name: "Officer Verma",
        email: newEmail,
        password: "Password123!",
        role: "INSPECTOR",
      });
    expect(createRes.status).toBe(201);
    expect(createRes.body.data.role).toBe("INSPECTOR");
    expect(createRes.body.data.passwordHash).toBeUndefined();
    const createdUserId = createRes.body.data.id;

    // Change role
    const roleRes = await request(app)
      .patch(`/api/v1/users/${createdUserId}/role`)
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ role: "REVIEWER" });
    expect(roleRes.status).toBe(200);
    expect(roleRes.body.data.role).toBe("REVIEWER");

    // Deactivate user
    const statusRes = await request(app)
      .patch(`/api/v1/users/${createdUserId}/status`)
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ isActive: false });
    expect(statusRes.status).toBe(200);
    expect(statusRes.body.data.isActive).toBe(false);

    // Self-lockout prevention: Admin cannot demote self
    const selfDemoteRes = await request(app)
      .patch(`/api/v1/users/${admin.id}/role`)
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ role: "VIEWER" });
    expect(selfDemoteRes.status).toBe(403);
    expect(selfDemoteRes.body.error.message).toMatch(/revoke/i);

    // Self-lockout prevention: Admin cannot deactivate self
    const selfDeactivateRes = await request(app)
      .patch(`/api/v1/users/${admin.id}/status`)
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ isActive: false });
    expect(selfDeactivateRes.status).toBe(403);
    expect(selfDeactivateRes.body.error.message).toMatch(/deactivate their own account/i);
  });

  // Admin audit log query
  it("allows Admin to query system audit logs, and blocks non-admins (403)", async () => {
    const admin = await makeUser("ADMIN");
    const res = await request(app)
      .get("/api/v1/audit")
      .set("Authorization", `Bearer ${admin.token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.items)).toBe(true);
    expect(res.body.data.pagination).toBeDefined();

    const inspector = await makeUser("INSPECTOR");
    const blockedRes = await request(app)
      .get("/api/v1/audit")
      .set("Authorization", `Bearer ${inspector.token}`);
    expect(blockedRes.status).toBe(403);
  });

  // 17, 18, 19. Review Queue behavior
  it("populates Review Queue for UNDER_REVIEW, AI REVIEW, and MANUAL_REQUIRED, but NOT for clean PASS", async () => {
    const inspector = await makeUser("INSPECTOR");
    const reviewer = await makeUser("REVIEWER");

    // Clean PASS inspection
    const passInsp = await request(app)
      .post("/api/v1/inspections")
      .set("Authorization", `Bearer ${inspector.token}`)
      .send({ packageType: "RETAIL" });
    await prisma.inspection.update({
      where: { id: passInsp.body.data.id },
      data: { status: "COMPLETED", overallResult: "PASS" },
    });
    await prisma.validationResult.create({
      data: { inspectionId: passInsp.body.data.id, ruleId: "R6.1e", status: "PASS", confidence: 0.95, reason: "MRP OK" },
    });

    // Review queue should NOT contain the pure PASS inspection
    const q1 = await request(app)
      .get("/api/v1/reviews/queue")
      .set("Authorization", `Bearer ${reviewer.token}`);
    expect(q1.status).toBe(200);
    const passFound = q1.body.data.find((item: any) => item.id === passInsp.body.data.id);
    expect(passFound).toBeUndefined();

    // AI REVIEW inspection
    const reviewInsp = await request(app)
      .post("/api/v1/inspections")
      .set("Authorization", `Bearer ${inspector.token}`)
      .send({ packageType: "RETAIL" });
    await prisma.inspection.update({
      where: { id: reviewInsp.body.data.id },
      data: { status: "COMPLETED", overallResult: "REVIEW" },
    });
    await prisma.validationResult.create({
      data: { inspectionId: reviewInsp.body.data.id, ruleId: "R6.1a", status: "REVIEW", confidence: 0.5, reason: "Marketer only declared" },
    });

    // AI MANUAL_REQUIRED inspection
    const manualInsp = await request(app)
      .post("/api/v1/inspections")
      .set("Authorization", `Bearer ${inspector.token}`)
      .send({ packageType: "RETAIL" });
    await prisma.validationResult.create({
      data: { inspectionId: manualInsp.body.data.id, ruleId: "R7.2", status: "MANUAL_REQUIRED", confidence: 0.8, reason: "Physical numeral height check" },
    });

    // Both should enter the queue!
    const q2 = await request(app)
      .get("/api/v1/reviews/queue")
      .set("Authorization", `Bearer ${reviewer.token}`);
    expect(q2.status).toBe(200);

    const revItem = q2.body.data.find((item: any) => item.id === reviewInsp.body.data.id);
    expect(revItem).toBeDefined();
    expect(revItem.pendingRules).toContain("R6.1a");

    const manualItem = q2.body.data.find((item: any) => item.id === manualInsp.body.data.id);
    expect(manualItem).toBeDefined();
    expect(manualItem.pendingRules).toContain("R7.2");

    // Inspector cannot access the queue
    const inspectorQueue = await request(app)
      .get("/api/v1/reviews/queue")
      .set("Authorization", `Bearer ${inspector.token}`);
    expect(inspectorQueue.status).toBe(403);
  });

  // 20. Cross-image conflict enters review queue and flags conflict
  it("correctly identifies cross-image conflict declarations in the Review Queue", async () => {
    const inspector = await makeUser("INSPECTOR");
    const reviewer = await makeUser("REVIEWER");

    const insp = await request(app)
      .post("/api/v1/inspections")
      .set("Authorization", `Bearer ${inspector.token}`)
      .send({ packageType: "RETAIL" });
    const inspectionId = insp.body.data.id;

    await prisma.declaration.create({
      data: {
        inspectionId,
        field: "mrp",
        rawText: "MRP 50",
        normalizedValue: "50",
        conflicts: [{ rawText: "MRP 60", imageId: "img-2", confidence: 0.9 }],
      },
    });
    await prisma.validationResult.create({
      data: { inspectionId, ruleId: "R6.1e", status: "REVIEW", confidence: 0.5, reason: "Cross-image conflict in MRP" },
    });

    const queueRes = await request(app)
      .get("/api/v1/reviews/queue")
      .set("Authorization", `Bearer ${reviewer.token}`);
    expect(queueRes.status).toBe(200);

    const queueItem = queueRes.body.data.find((item: any) => item.id === inspectionId);
    expect(queueItem).toBeDefined();
    expect(queueItem.hasConflicts).toBe(true);
    expect(queueItem.pendingRules).toContain("R6.1e");
  });

  // 21. Marketer-only Rule 6(1)(a) case enters review queue
  it("routes marketer-only Rule 6(1)(a) cases to the Review Queue for human oversight", async () => {
    const inspector = await makeUser("INSPECTOR");
    const reviewer = await makeUser("REVIEWER");

    const insp = await request(app)
      .post("/api/v1/inspections")
      .set("Authorization", `Bearer ${inspector.token}`)
      .send({ packageType: "RETAIL" });
    const inspectionId = insp.body.data.id;

    await prisma.validationResult.create({
      data: {
        inspectionId,
        ruleId: "R6.1a",
        status: "REVIEW",
        confidence: 0.5,
        reason: "Package declares marketer/brand owner details without explicit manufacturer/packer details. Routing to human review per Rule 6(1)(a).",
      },
    });

    const queueRes = await request(app)
      .get("/api/v1/reviews/queue")
      .set("Authorization", `Bearer ${reviewer.token}`);
    expect(queueRes.status).toBe(200);

    const queueItem = queueRes.body.data.find((item: any) => item.id === inspectionId);
    expect(queueItem).toBeDefined();
    expect(queueItem.pendingRules).toContain("R6.1a");
    expect(queueItem.reasons[0]).toMatch(/marketer/i);
  });
});

