import request from "supertest";
import sharp from "sharp";
import { createApp } from "../app.js";
import { prisma } from "../db/prisma.js";

const app = createApp();

async function makeUser(role: "INSPECTOR" | "VIEWER" | "ADMIN" = "INSPECTOR") {
  const email = `user${Math.random().toString(36).slice(2, 10)}@example.com`;
  const password = "Password123!";
  await request(app).post("/api/v1/auth/register").send({ name: "Img Tester", email, password });
  if (role !== "INSPECTOR") {
    await prisma.user.update({ where: { email }, data: { role } });
  }
  const login = await request(app).post("/api/v1/auth/login").send({ email, password });
  return { token: login.body.data.token as string, id: login.body.data.user.id as string };
}

async function makeInspection(token: string) {
  const res = await request(app)
    .post("/api/v1/inspections")
    .set("Authorization", `Bearer ${token}`)
    .send({ packageType: "RETAIL", location: "Test Market" });
  return res.body.data as { id: string; inspectionNumber: string };
}

async function jpegBuffer(w = 200, h = 150, color: { r: number; g: number; b: number } = { r: 120, g: 140, b: 90 }) {
  return sharp({ create: { width: w, height: h, channels: 3, background: color } }).jpeg().toBuffer();
}

function attach(buf: Buffer, name: string, mime = "image/jpeg") {
  return { buffer: buf, name, mime };
}

describe("Phase 2 — inspection intake & images", () => {
  it("creates an inspection with INS-YYYY-NNNNNN number and retrieves it", async () => {
    const { token } = await makeUser();
    const create = await request(app)
      .post("/api/v1/inspections")
      .set("Authorization", `Bearer ${token}`)
      .send({ packageType: "RETAIL", location: "Delhi", notes: "phase2" });
    expect(create.status).toBe(201);
    expect(create.body.data.inspectionNumber).toMatch(/^INS-\d{4}-\d{6}$/);
    const get = await request(app)
      .get(`/api/v1/inspections/${create.body.data.id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(get.status).toBe(200);
    expect(get.body.data.inspectionNumber).toBe(create.body.data.inspectionNumber);
  });

  it("uploads valid images and lists them with metadata", async () => {
    const { token } = await makeUser();
    const insp = await makeInspection(token);
    const a = attach(await jpegBuffer(200, 150), "front.jpg");
    const b = attach(await sharp({ create: { width: 90, height: 90, channels: 4, background: { r: 10, g: 20, b: 30, alpha: 1 } } }).png().toBuffer(), "back.png", "image/png");
    const res = await request(app)
      .post(`/api/v1/inspections/${insp.id}/images`)
      .set("Authorization", `Bearer ${token}`)
      .field("x", "y")
      .attach("images", a.buffer, a.name)
      .attach("images", b.buffer, b.name);
    expect(res.status).toBe(201);
    expect(res.body.data.uploaded).toHaveLength(2);
    expect(res.body.data.failed).toHaveLength(0);
    const [first, second] = res.body.data.uploaded;
    expect(first.width).toBe(200);
    expect(first.height).toBe(150);
    expect(second.mimeType).toBe("image/png");
    expect(second.width).toBe(90);
    const list = await request(app)
      .get(`/api/v1/inspections/${insp.id}/images`)
      .set("Authorization", `Bearer ${token}`);
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(2);
    expect(list.body.data[0].sequence).toBe(1);
  });

  it("rejects an invalid file type", async () => {
    const { token } = await makeUser();
    const insp = await makeInspection(token);
    const res = await request(app)
      .post(`/api/v1/inspections/${insp.id}/images`)
      .set("Authorization", `Bearer ${token}`)
      .attach("images", Buffer.from("not an image at all"), { filename: "fake.jpg", contentType: "image/jpeg" });
    expect([201, 207]).toContain(res.status);
    expect(res.body.data.uploaded).toHaveLength(0);
    expect(res.body.data.failed).toHaveLength(1);
    expect(res.body.data.failed[0].reason).toMatch(/valid|match/i);
  });

  it("rejects an oversized file", async () => {
    const { token } = await makeUser();
    const insp = await makeInspection(token);
    // >10 MB of real JPEG data is hard to fake compactly; send a big buffer of junk
    // which fails decode first — instead assert the size-limit path via a 10MB+1 buffer of a real image format header
    const big = Buffer.concat([await jpegBuffer(2000, 2000), Buffer.alloc(10 * 1024 * 1024 + 1)]);
    const res = await request(app)
      .post(`/api/v1/inspections/${insp.id}/images`)
      .set("Authorization", `Bearer ${token}`)
      .attach("images", big, { filename: "big.jpg", contentType: "image/jpeg" });
    expect([207, 413]).toContain(res.status);
    if (res.body?.data?.failed) expect(res.body.data.failed[0].reason).toMatch(/size|exceeds|large/i);
  });

  it("deletes an image and resequences the rest", async () => {
    const { token } = await makeUser();
    const insp = await makeInspection(token);
    const up = await request(app)
      .post(`/api/v1/inspections/${insp.id}/images`)
      .set("Authorization", `Bearer ${token}`)
      .attach("images", await jpegBuffer(100, 100), "a.jpg")
      .attach("images", await jpegBuffer(110, 110), "b.jpg")
      .attach("images", await jpegBuffer(120, 120), "c.jpg");
    const ids = up.body.data.uploaded.map((i: { id: string }) => i.id) as string[];
    const del = await request(app)
      .delete(`/api/v1/inspections/${insp.id}/images/${ids[1]}`)
      .set("Authorization", `Bearer ${token}`);
    expect(del.status).toBe(200);
    const list = await request(app)
      .get(`/api/v1/inspections/${insp.id}/images`)
      .set("Authorization", `Bearer ${token}`);
    expect(list.body.data).toHaveLength(2);
    expect(list.body.data.map((i: { sequence: number }) => i.sequence)).toEqual([1, 2]);
  });

  it("reorders images via PATCH and persists the order", async () => {
    const { token } = await makeUser();
    const insp = await makeInspection(token);
    const up = await request(app)
      .post(`/api/v1/inspections/${insp.id}/images`)
      .set("Authorization", `Bearer ${token}`)
      .attach("images", await jpegBuffer(100, 100), "a.jpg")
      .attach("images", await jpegBuffer(110, 110), "b.jpg");
    const ids = up.body.data.uploaded.map((i: { id: string }) => i.id) as string[];
    const reordered = await request(app)
      .patch(`/api/v1/inspections/${insp.id}/images/reorder`)
      .set("Authorization", `Bearer ${token}`)
      .send({ orderedIds: [ids[1], ids[0]] });
    expect(reordered.status).toBe(200);
    expect(reordered.body.data[0].id).toBe(ids[1]);
    const list = await request(app)
      .get(`/api/v1/inspections/${insp.id}/images`)
      .set("Authorization", `Bearer ${token}`);
    expect(list.body.data[0].id).toBe(ids[1]);
  });

  it("blocks an inspector from accessing another user's inspection", async () => {
    const owner = await makeUser("INSPECTOR");
    const insp = await makeInspection(owner.token);
    const other = await makeUser("INSPECTOR");
    const get = await request(app)
      .get(`/api/v1/inspections/${insp.id}`)
      .set("Authorization", `Bearer ${other.token}`);
    expect(get.status).toBe(404);
    const imgs = await request(app)
      .get(`/api/v1/inspections/${insp.id}/images`)
      .set("Authorization", `Bearer ${other.token}`);
    expect(imgs.status).toBe(404);
    const upload = await request(app)
      .post(`/api/v1/inspections/${insp.id}/images`)
      .set("Authorization", `Bearer ${other.token}`)
      .attach("images", await jpegBuffer(50, 50), "x.jpg");
    expect([403, 404]).toContain(upload.status);
  });
});
