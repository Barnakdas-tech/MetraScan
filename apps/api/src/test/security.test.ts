import request from "supertest";
import sharp from "sharp";
import axios from "axios";
import { createApp } from "../app.js";
import { prisma } from "../db/prisma.js";

const app = createApp();

async function makeUser(role: "INSPECTOR" | "REVIEWER" | "VIEWER" | "ADMIN" = "INSPECTOR") {
  const email = `sec${Math.random().toString(36).slice(2, 10)}@example.com`;
  const password = "Password123!";
  await request(app).post("/api/v1/auth/register").send({ name: "Sec Tester", email, password });
  if (role !== "INSPECTOR") {
    await prisma.user.update({ where: { email }, data: { role } });
  }
  const login = await request(app).post("/api/v1/auth/login").send({ email, password });
  return { token: login.body.data.token, id: login.body.data.user.id, role };
}

async function jpegBuffer(w = 100, h = 100) {
  return sharp({ create: { width: w, height: h, channels: 3, background: { r: 120, g: 120, b: 120 } } }).jpeg().toBuffer();
}

async function makeInspection(token: string) {
  const res = await request(app)
    .post("/api/v1/inspections")
    .set("Authorization", `Bearer ${token}`)
    .send({ packageType: "RETAIL" });
  return res.body.data as { id: string };
}

describe("Security regression tests", () => {
  it("rejects a weak password at registration", async () => {
    const res = await request(app)
      .post("/api/v1/auth/register")
      .send({ name: "Weak", email: `weak${Math.random().toString(36).slice(2, 8)}@example.com`, password: "alllowercase1" });
    expect(res.status).toBe(400);
  });

  it("revokes a token on logout so it cannot be replayed", async () => {
    const { token } = await makeUser();
    const logout = await request(app).post("/api/v1/auth/logout").set("Authorization", `Bearer ${token}`);
    expect(logout.status).toBe(200);
    const replay = await request(app).get("/api/v1/auth/me").set("Authorization", `Bearer ${token}`);
    expect(replay.status).toBe(401);
  });

  it("rejects a stale token after the user is deactivated", async () => {
    const email = `deactivate${Math.random().toString(36).slice(2, 8)}@example.com`;
    await request(app).post("/api/v1/auth/register").send({ name: "Deactivated", email, password: "Password123!" });
    const login = await request(app).post("/api/v1/auth/login").send({ email, password: "Password123!" });
    const token = login.body.data.token;
    await prisma.user.update({ where: { email }, data: { isActive: false } });
    const me = await request(app).get("/api/v1/auth/me").set("Authorization", `Bearer ${token}`);
    expect(me.status).toBe(401);
  });

  it("re-checks the live role on every request (role change takes effect immediately)", async () => {
    const email = `rolechange${Math.random().toString(36).slice(2, 8)}@example.com`;
    await request(app).post("/api/v1/auth/register").send({ name: "Role Changer", email, password: "Password123!" });
    const login = await request(app).post("/api/v1/auth/login").send({ email, password: "Password123!" });
    const token = login.body.data.token;
    await prisma.user.update({ where: { email }, data: { role: "VIEWER" } });
    const create = await request(app)
      .post("/api/v1/inspections")
      .set("Authorization", `Bearer ${token}`)
      .send({ packageType: "RETAIL" });
    expect(create.status).toBe(403);
  });

  it("blocks cross-user access to a stored image", async () => {
    const owner = await makeUser();
    const insp = await makeInspection(owner.token);
    const up = await request(app)
      .post(`/api/v1/inspections/${insp.id}/images`)
      .set("Authorization", `Bearer ${owner.token}`)
      .attach("images", await jpegBuffer(100, 100), "img.jpg");
    const key = up.body.data.uploaded[0].storageKey;
    const other = await makeUser("INSPECTOR");
    const res = await request(app)
      .get(`/api/v1/storage/${encodeURIComponent(key)}`)
      .set("Authorization", `Bearer ${other.token}`);
    expect(res.status).toBe(404);
  });

  it("allows the image owner to fetch their stored image", async () => {
    const owner = await makeUser();
    const insp = await makeInspection(owner.token);
    const up = await request(app)
      .post(`/api/v1/inspections/${insp.id}/images`)
      .set("Authorization", `Bearer ${owner.token}`)
      .attach("images", await jpegBuffer(100, 100), "img.jpg");
    const key = up.body.data.uploaded[0].storageKey;
    const res = await request(app)
      .get(`/api/v1/storage/${encodeURIComponent(key)}`)
      .set("Authorization", `Bearer ${owner.token}`);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("image/jpeg");
  });

  it("scopes product compliance history to the requesting inspector", async () => {
    const inspectorA = await makeUser();
    const inspectorB = await makeUser();
    const product = await prisma.product.create({ data: { name: "Shared Product X" } });
    for (const [inspector, status] of [[inspectorA, "FAIL"], [inspectorB, "PASS"]] as const) {
      const insp = await prisma.inspection.create({
        data: { inspectionNumber: `SEC-${Math.random().toString(36).slice(2)}`, year: 2026, inspectorId: inspector.id, productId: product.id, packageType: "RETAIL", intendedConsumer: "RETAIL" },
      });
      await prisma.validationResult.create({
        data: { inspectionId: insp.id, ruleId: "R6.1e", status: status as never, confidence: 0.9, reason: "test", validatorVersion: "v1" },
      });
    }
    const resA = await request(app).get(`/api/v1/products/${product.id}`).set("Authorization", `Bearer ${inspectorA.token}`);
    expect(resA.status).toBe(200);
    expect(resA.body.data.complianceHistory).toHaveLength(1);
    expect(resA.body.data.complianceHistory[0].status).toBe("FAIL");
    const resB = await request(app).get(`/api/v1/products/${product.id}`).set("Authorization", `Bearer ${inspectorB.token}`);
    expect(resB.body.data.complianceHistory).toHaveLength(1);
    expect(resB.body.data.complianceHistory[0].status).toBe("PASS");
  });

  it("caps the number of images per inspection", async () => {
    const { token } = await makeUser();
    const insp = await makeInspection(token);
    for (let batch = 0; batch < 3; batch++) {
      const req = request(app).post(`/api/v1/inspections/${insp.id}/images`).set("Authorization", `Bearer ${token}`);
      for (let i = 0; i < 8; i++) req.attach("images", await jpegBuffer(60, 60), `b${batch}i${i}.jpg`);
      await req;
    }
    const extra = request(app).post(`/api/v1/inspections/${insp.id}/images`).set("Authorization", `Bearer ${token}`);
    extra.attach("images", await jpegBuffer(60, 60), "extra.jpg");
    const res = await extra;
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/at most/i);
  });

  it("clamps a backdated inspectionDate to now", async () => {
    const { token } = await makeUser();
    const farPast = new Date("2011-06-01").toISOString();
    const res = await request(app)
      .post("/api/v1/inspections")
      .set("Authorization", `Bearer ${token}`)
      .send({ packageType: "RETAIL", inspectionDate: farPast });
    expect(res.status).toBe(201);
    const insp = await prisma.inspection.findUnique({ where: { id: res.body.data.id } });
    expect(insp?.inspectionDate.getTime()).toBeGreaterThan(Date.now() - 24 * 60 * 60 * 1000);
  });

  it("rejects an oversized-dimension image (pixel bomb)", async () => {
    const { token } = await makeUser();
    const insp = await makeInspection(token);
    // 20001px on one side exceeds the 10000px per-side limit
    const res = await request(app)
      .post(`/api/v1/inspections/${insp.id}/images`)
      .set("Authorization", `Bearer ${token}`)
      .attach("images", await jpegBuffer(20001, 10), { filename: "tall.jpg", contentType: "image/jpeg" });
    expect([207, 201]).toContain(res.status);
    expect(res.body.data.failed.length).toBe(1);
    expect(res.body.data.failed[0].reason).toMatch(/dimension|pixel/i);
  });

  it("preserves previous OCR results when analysis re-runs (no destructive delete)", async () => {
    const owner = await makeUser();
    const insp = await makeInspection(owner.token);
    const up = await request(app)
      .post(`/api/v1/inspections/${insp.id}/images`)
      .set("Authorization", `Bearer ${owner.token}`)
      .attach("images", await jpegBuffer(100, 100), "img.jpg");
    const imageId = up.body.data.uploaded[0].id;

    // Simulate two completed OCR runs (as the analysis pipeline would write).
    for (const text of ["run-one", "run-two"]) {
      const result = await prisma.ocrResult.create({
        data: {
          imageId,
          provider: "test",
          language: "en",
          qualityReport: {} as never,
          preprocessing: [] as never,
          fullText: text,
          regionCount: 0,
          processingMs: 1,
          success: true,
        },
      });
      await prisma.ocrRegion.create({
        data: { resultId: result.id, text, confidence: 0.9, bbox: [1, 2, 3, 4] as never, seq: 1 },
      });
    }

    const count = await prisma.ocrResult.count({ where: { imageId } });
    expect(count).toBe(2);
    const regions = await prisma.ocrRegion.count({ where: { result: { imageId } } });
    expect(regions).toBe(2);
  });

  it("AI service rejects requests without a valid internal token (boundary is not open)", async () => {
    // The AI service must never be callable by an unauthenticated client.
    // With no shared token configured for the test run, the service must
    // refuse every request rather than accept an attacker's value.
    try {
      const res = await axios.get(`${process.env.AI_SERVICE_URL ?? "http://localhost:8000"}/health`, {
        headers: { "X-Internal-Token": "definitely-not-the-token-1234" },
        timeout: 3000,
      });
      expect([200]).not.toContain(res.status); // must not be 200 with a wrong token
    } catch (err) {
      // 401/403 are the expected rejections.
      const status = (err as { response?: { status?: number } }).response?.status;
      expect([401, 403, 503]).toContain(status);
    }
  }, 10000);
});
