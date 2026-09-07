import request from "supertest";
import { createApp } from "../app.js";
import { prisma } from "../db/prisma.js";

const app = createApp();

async function makeUser() {
  const email = `user${Math.random().toString(36).slice(2, 10)}@example.com`;
  const password = "Password123!";
  await request(app).post("/api/v1/auth/register").send({ name: "User Tester", email, password });
  const login = await request(app).post("/api/v1/auth/login").send({ email, password });
  return { token: login.body.data.token, id: login.body.data.user.id, email, password };
}

describe("User settings", () => {
  it("updates profile", async () => {
    const user = await makeUser();
    const res = await request(app)
      .patch("/api/v1/users/me")
      .set("Authorization", `Bearer ${user.token}`)
      .send({ name: "Updated Name" });
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe("Updated Name");
    
    // Verify DB
    const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
    expect(dbUser?.name).toBe("Updated Name");
  });

  it("updates password", async () => {
    const user = await makeUser();
    const res = await request(app)
      .post("/api/v1/users/me/password")
      .set("Authorization", `Bearer ${user.token}`)
      .send({ currentPassword: user.password, newPassword: "NewPassword123!" });
    expect(res.status).toBe(200);

    // Try logging in with new password
    const loginRes = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: user.email, password: "NewPassword123!" });
    expect(loginRes.status).toBe(200);
    
    // Old password should fail
    const loginFail = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: user.email, password: user.password });
    expect(loginFail.status).toBe(401);
  });
});
