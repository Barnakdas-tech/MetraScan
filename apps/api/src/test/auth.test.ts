import request from "supertest";
import { createApp } from "../app.js";

const app = createApp();

describe("Auth", () => {
  it("registers a new user", async () => {
    const res = await request(app)
      .post("/api/v1/auth/register")
      .send({ name: "Inspector One", email: "inspector1@example.com", password: "Password123!" });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.email).toBe("inspector1@example.com");
    expect(res.body.data.role).toBe("INSPECTOR");
    expect(res.body.data).not.toHaveProperty("passwordHash");
  });

  it("rejects duplicate email", async () => {
    const payload = { name: "Dup", email: "dup@example.com", password: "Password123!" };
    const first = await request(app).post("/api/v1/auth/register").send(payload);
    expect(first.status).toBe(201);
    const second = await request(app).post("/api/v1/auth/register").send(payload);
    expect(second.status).toBe(403);
    expect(second.body.success).toBe(false);
    expect(second.body.error.code).toBe("FORBIDDEN");
  });

  it("logs in with valid credentials", async () => {
    await request(app)
      .post("/api/v1/auth/register")
      .send({ name: "Login User", email: "login@example.com", password: "Password123!" });
    const res = await request(app).post("/api/v1/auth/login").send({
      email: "login@example.com",
      password: "Password123!",
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBeTruthy();
    expect(res.body.data.user.role).toBe("INSPECTOR");
  });

  it("rejects invalid password", async () => {
    await request(app)
      .post("/api/v1/auth/register")
      .send({ name: "Bad Pw", email: "badpw@example.com", password: "Password123!" });
    const res = await request(app).post("/api/v1/auth/login").send({
      email: "badpw@example.com",
      password: "WrongPassword!",
    });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });

  it("rejects protected route without token", async () => {
    const res = await request(app).get("/api/v1/auth/me");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });
});
