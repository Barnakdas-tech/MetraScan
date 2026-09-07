import request from "supertest";
import { createApp } from "../app.js";
import { prisma } from "../db/prisma.js";

const app = createApp();

async function makeUser(role: "INSPECTOR" | "REVIEWER" = "INSPECTOR") {
  const email = `p9user${Math.random().toString(36).slice(2, 10)}@example.com`;
  const password = "Password123!";
  await request(app).post("/api/v1/auth/register").send({ name: "P9 Tester", email, password });
  if (role !== "INSPECTOR") {
    await prisma.user.update({ where: { email }, data: { role } });
  }
  const login = await request(app).post("/api/v1/auth/login").send({ email, password });
  return { token: login.body.data.token, id: login.body.data.user.id };
}

describe("Phase 9 - dashboard", () => {
  it("requires authentication", async () => {
    const res = await request(app).get("/api/v1/dashboard/summary");
    expect(res.status).toBe(401);
  });

  it("returns zero/empty summary for a fresh user (no fake numbers)", async () => {
    const { token } = await makeUser();
    const res = await request(app)
      .get("/api/v1/dashboard/summary")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.totalInspections).toBe(0);
    expect(d.compliant).toBe(0);
    expect(d.nonCompliant).toBe(0);
    expect(d.reviewRequired).toBe(0);
    expect(d.openViolations).toBe(0);
  });

  it("returns empty recent/violations/trends for a fresh user", async () => {
    const { token } = await makeUser();
    const [recent, violations, trends] = await Promise.all([
      request(app).get("/api/v1/dashboard/recent").set("Authorization", `Bearer ${token}`),
      request(app).get("/api/v1/dashboard/violations").set("Authorization", `Bearer ${token}`),
      request(app).get("/api/v1/dashboard/trends").set("Authorization", `Bearer ${token}`),
    ]);
    expect(recent.status).toBe(200);
    expect(recent.body.data).toEqual([]);
    expect(violations.status).toBe(200);
    expect(violations.body.data).toEqual([]);
    expect(trends.status).toBe(200);
    expect(trends.body.data.inspectionOutcomes).toEqual([]);
    expect(trends.body.data.violationsByRule).toEqual([]);
    expect(trends.body.data.violationsByCategory).toEqual([]);
    expect(trends.body.data.reviewRate).toBeNull(); // null = no data, not fake 0%
    expect(trends.body.data.commonMissingDeclarations).toEqual([]);
  });

  it("scopes inspector dashboards to their own inspections", async () => {
    const owner = await makeUser();
    await request(app)
      .post("/api/v1/inspections")
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ packageType: "RETAIL" });

    const other = await makeUser();
    const otherSummary = await request(app)
      .get("/api/v1/dashboard/summary")
      .set("Authorization", `Bearer ${other.token}`);
    expect(otherSummary.body.data.totalInspections).toBe(0);

    const ownerSummary = await request(app)
      .get("/api/v1/dashboard/summary")
      .set("Authorization", `Bearer ${owner.token}`);
    expect(ownerSummary.body.data.totalInspections).toBeGreaterThanOrEqual(1);
  });
});

describe("Phase 9 - inspection history", () => {
  it("supports search, filter, sort, and pagination", async () => {
    const { token } = await makeUser();
    // Create three inspections with distinct products
    for (const name of ["Alpha Soap", "Beta Biscuits", "Gamma Tea"]) {
      await request(app)
        .post("/api/v1/inspections")
        .set("Authorization", `Bearer ${token}`)
        .send({ packageType: "RETAIL", product: { name } });
    }

    // Pagination
    const page1 = await request(app)
      .get("/api/v1/inspections?page=1&pageSize=2")
      .set("Authorization", `Bearer ${token}`);
    expect(page1.status).toBe(200);
    expect(page1.body.data.items).toHaveLength(2);
    expect(page1.body.data.pagination.total).toBe(3);
    expect(page1.body.data.pagination.totalPages).toBe(2);

    const page2 = await request(app)
      .get("/api/v1/inspections?page=2&pageSize=2")
      .set("Authorization", `Bearer ${token}`);
    expect(page2.body.data.items).toHaveLength(1);

    // Search
    const search = await request(app)
      .get("/api/v1/inspections?q=Biscuits")
      .set("Authorization", `Bearer ${token}`);
    expect(search.body.data.items).toHaveLength(1);
    expect(search.body.data.items[0].product.name).toBe("Beta Biscuits");

    // Filter by status
    const filtered = await request(app)
      .get("/api/v1/inspections?status=DRAFT")
      .set("Authorization", `Bearer ${token}`);
    expect(filtered.body.data.items).toHaveLength(3);

    // Sort ascending by inspection number
    const sorted = await request(app)
      .get("/api/v1/inspections?sortBy=inspectionNumber&sortOrder=asc&pageSize=3")
      .set("Authorization", `Bearer ${token}`);
    const numbers = sorted.body.data.items.map((i: { inspectionNumber: string }) => i.inspectionNumber);
    expect(numbers).toEqual([...numbers].sort());
  });
});

describe("Phase 9 - products", () => {
  it("lists products with search and pagination", async () => {
    const { token } = await makeUser();
    const list = await request(app)
      .get("/api/v1/products?pageSize=5")
      .set("Authorization", `Bearer ${token}`);
    expect(list.status).toBe(200);
    expect(Array.isArray(list.body.data.items)).toBe(true);
    expect(list.body.data.pagination.totalPages).toBeGreaterThanOrEqual(1);
  });

  it("returns 404 for an unknown product", async () => {
    const { token } = await makeUser();
    const res = await request(app)
      .get("/api/v1/products/00000000-0000-0000-0000-000000000000")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});
