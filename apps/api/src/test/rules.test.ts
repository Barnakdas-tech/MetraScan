import request from "supertest";
import { createApp } from "../app.js";
import { prisma } from "../db/prisma.js";

const app = createApp();

async function makeUser() {
  const email = `ruleuser${Math.random().toString(36).slice(2, 10)}@example.com`;
  const password = "Password123!";
  await request(app).post("/api/v1/auth/register").send({ name: "Rule Tester", email, password });
  const login = await request(app).post("/api/v1/auth/login").send({ email, password });
  return login.body.data.token;
}

describe("Rules API", () => {
  it("rejects unauthenticated requests", async () => {
    const res = await request(app).get("/api/v1/rules");
    expect(res.status).toBe(401);
  });

  it("returns all rules when authenticated", async () => {
    const token = await makeUser();
    const res = await request(app).get("/api/v1/rules").set("Authorization", `Bearer ${token}`);
    
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(7); // It should return the full registry, not just the 7 evaluated rules
    expect(res.body.data[0].ruleId).toBeDefined();
    expect(res.body.data[0].title).toBeDefined();
  });

  it("returns a specific rule by ID", async () => {
    const token = await makeUser();
    const listRes = await request(app).get("/api/v1/rules").set("Authorization", `Bearer ${token}`);
    const firstRuleId = listRes.body.data[0].ruleId;

    const res = await request(app).get(`/api/v1/rules/${firstRuleId}`).set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.ruleId).toBe(firstRuleId);
  });

  it("returns 404 for an unknown rule", async () => {
    const token = await makeUser();
    const res = await request(app).get("/api/v1/rules/UNKNOWN-RULE").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});
