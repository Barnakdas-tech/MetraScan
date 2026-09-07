import request from "supertest";
import { createApp } from "../app.js";
import { prisma } from "../db/prisma.js";

const app = createApp();

async function registerAndLogin(role: string, name = "Test User") {
  const email = `user${Math.random().toString(36).slice(2, 10)}@example.com`;
  const password = "Password123!";
  await request(app).post("/api/v1/auth/register").send({ name, email, password });
  // Role is INSPECTOR by default; manually promote for the role tests.
  if (role !== "INSPECTOR") {
    await prisma.user.update({ where: { email }, data: { role: role as never } });
  }
  const loginRes = await request(app).post("/api/v1/auth/login").send({ email, password });
  return loginRes.body.data.token;
}

describe("Inspections", () => {
  it("allows INSPECTOR to create an inspection", async () => {
    const token = await registerAndLogin("INSPECTOR");
    const res = await request(app)
      .post("/api/v1/inspections")
      .set("Authorization", `Bearer ${token}`)
      .send({
        packageType: "RETAIL",
        location: "Market A, Delhi",
        notes: "Phase 1 smoke test",
        product: { name: "Test Biscuits", brand: "Britannia" },
      });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.inspectionNumber).toMatch(/^INS-\d{4}-\d{6}$/);
    expect(res.body.data.status).toBe("DRAFT");
    expect(res.body.data.product.name).toBe("Test Biscuits");
  });

  it("rejects creation without authentication", async () => {
    const res = await request(app).post("/api/v1/inspections").send({});
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });

  it("rejects VIEWER from creating inspections (role authorization)", async () => {
    const token = await registerAndLogin("VIEWER");
    const res = await request(app)
      .post("/api/v1/inspections")
      .set("Authorization", `Bearer ${token}`)
      .send({ packageType: "RETAIL" });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("rejects REVIEWER from creating inspections (role authorization)", async () =>  {
    const token = await registerAndLogin("REVIEWER");
    const res = await request(app)
      .post("/api/v1/inspections")
      .set("Authorization", `Bearer ${token}`)
      .send({ packageType: "RETAIL" });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });
});
