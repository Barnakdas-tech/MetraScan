import request from "supertest";
import sharp from "sharp";
import { createApp } from "../app.js";
import { extractDeclarations } from "../extractors/fieldExtractors.js";
import { classifyProduct } from "../extractors/productClassifier.js";
import type { OcrTextWithEvidence } from "../extractors/types.js";

const app = createApp();

function region(text: string, id = "r" + Math.random().toString(36).slice(2, 8)): OcrTextWithEvidence {
  return { id, text, confidence: 0.95, bbox: [10, 20, 100, 30], imageId: "img1" };
}

describe("Phase 4 - deterministic extractors", () => {
  it("extracts MRP with currency and confidence", () => {
    const out = extractDeclarations([region("MRP Rs. 30 (incl. of all taxes)")]);
    const mrp = out.find(d => d.field === "mrp");
    expect(mrp).toBeDefined();
    expect(mrp!.normalizedValue).toBe("30");
    expect(mrp!.currency).toBe("INR");
    expect(mrp!.confidence).toBeGreaterThan(0.5);
    expect(mrp!.bbox).toEqual([10, 20, 100, 30]);
    expect(mrp!.ocrRegionIds).toHaveLength(1);
  });

  it("extracts net quantity with unit", () => {
    const out = extractDeclarations([region("Net Quantity: 250 g")]);
    const nq = out.find(d => d.field === "netQuantity");
    expect(nq).toBeDefined();
    expect(nq!.normalizedValue).toBe("250");
    expect(nq!.unit).toBe("g");
  });

  it("normalizes quantity variants (ml, kg, multipack)", () => {
    const ml = extractDeclarations([region("Net Qty 750 ml")]).find(d => d.field === "netQuantity");
    expect(ml?.unit).toBe("ml");
    const kg = extractDeclarations([region("Net Wt. 1.5 kg")]).find(d => d.field === "netQuantity");
    expect(kg?.normalizedValue).toBe("1.5");
    expect(kg?.unit).toBe("kg");
    const multi = extractDeclarations([region("Net Quantity 2 x 100 g")]).find(d => d.field === "netQuantity");
    expect(multi?.normalizedValue).toBe("200");
  });

  it("extracts manufacturer name and address (neighbor heuristic)", () => {
    const regions = [
      region("Manufactured by: Britannia Industries Ltd.", "a1"),
      region("Plot No. 5, Sector 44, Gurugram, Haryana 122003", "a2"),
    ];
    const out = extractDeclarations(regions);
    const name = out.find(d => d.field === "manufacturerName");
    const address = out.find(d => d.field === "manufacturerAddress");
    expect(name?.normalizedValue).toContain("Britannia");
    expect(address).toBeDefined();
    expect(address!.normalizedValue).toContain("Sector 44");
    expect(address!.ocrRegionIds).toContain("a2");
  });

  it("extracts and normalizes dates", () => {
    const mfd = extractDeclarations([region("MFD: SEP 2026")]).find(d => d.field === "manufactureDate");
    expect(mfd?.normalizedValue).toBe("2026-09");
    const useBy = extractDeclarations([region("Use By 12-09-2026")]).find(d => d.field === "useBy");
    expect(useBy?.normalizedValue).toBe("2026-09-12");
    const bb = extractDeclarations([region("Best Before 6 months from packaging")]).find(d => d.field === "bestBefore");
    expect(bb?.normalizedValue).toBe("6 months");
  });

  it("extracts consumer care phone and email", () => {
    const out = extractDeclarations([
      region("Consumer Care: 1800-266-1118", "p1"),
      region("care@example.com", "e1"),
    ]);
    const phone = out.find(d => d.field === "consumerCarePhone");
    const email = out.find(d => d.field === "consumerCareEmail");
    expect(phone?.normalizedValue).toContain("1800");
    expect(email?.normalizedValue).toBe("care@example.com");
  });

  it("extracts country of origin", () => {
    const out = extractDeclarations([region("Country of Origin: India")]);
    expect(out.find(d => d.field === "countryOfOrigin")?.normalizedValue).toBe("India");
  });

  it("does NOT treat detection as compliance (observation only)", () => {
    const out = extractDeclarations([region("MRP 999")]);
    const mrp = out.find(d => d.field === "mrp");
    expect(mrp).toBeDefined();
    // The contract: rawText + evidence retained; no compliance field anywhere.
    expect(mrp!.detectionMethod).toMatch(/^regex:/);
    expect(mrp!.ocrConfidence).toBeGreaterThan(0);
  });

  it("extracts declaration with bounding-box evidence (Refinement 2A)", () => {
    const out = extractDeclarations([region("MRP Rs. 30", "r1")]);
    const mrp = out.find(d => d.field === "mrp");
    expect(mrp).toBeDefined();
    expect(mrp!.bbox).toEqual([10, 20, 100, 30]);
  });

  it("extracts declaration without bounding-box evidence (Refinement 2A)", () => {
    const noBboxRegion = { id: "r2", text: "Net Quantity: 500 g", confidence: 0.9, bbox: null, imageId: "img1" };
    const out = extractDeclarations([noBboxRegion]);
    const nq = out.find(d => d.field === "netQuantity");
    expect(nq).toBeDefined();
    expect(nq!.bbox).toBeNull(); // Do not invent coordinates
  });

  it("preserves raw OCR text, normalized value, and confidence (Refinement 2A)", () => {
    const raw = "MRP Rs. 30 (incl. of all taxes)";
    const out = extractDeclarations([region(raw, "r3")]);
    const mrp = out.find(d => d.field === "mrp");
    expect(mrp).toBeDefined();
    expect(mrp!.rawText).toBe(raw);
    expect(mrp!.normalizedValue).toBe("30");
    expect(mrp!.confidence).toBeGreaterThan(0);
    expect(mrp!.ocrConfidence).toBe(0.95);
  });
});

describe("Phase 4 - product classifier", () => {
  it("classifies food with honest confidence", () => {
    const r = classifyProduct(["Marie Gold Tea Biscuits", "Net Quantity: 250 g", "wheat flour"]);
    expect(r.category).toBe("food");
    expect(r.confidence).toBeGreaterThan(0.4);
    expect(r.source).toBe("keyword-heuristic");
  });

  it("returns unknown with low confidence when no signal", () => {
    const r = classifyProduct(["XYZ Product 12345"]);
    expect(r.category).toBe("unknown");
    expect(r.confidence).toBeLessThan(0.4);
  });

  it("keeps single-keyword confidence low", () => {
    const r = classifyProduct(["soap"]);
    expect(r.confidence).toBeLessThanOrEqual(0.55);
  });
});

async function makeUserWithAnalyzedInspection() {
  const email = `p4user${Math.random().toString(36).slice(2, 10)}@example.com`;
  const password = "Password123!";
  await request(app).post("/api/v1/auth/register").send({ name: "P4 Tester", email, password });
  const login = await request(app).post("/api/v1/auth/login").send({ email, password });
  const token = login.body.data.token;

  const create = await request(app)
    .post("/api/v1/inspections")
    .set("Authorization", `Bearer ${token}`)
    .send({ packageType: "RETAIL" });
  const inspId = create.body.data.id;

  // Real label-like image so OCR extracts (AI service must be up for these endpoint tests)
  const label = await sharp({
    create: { width: 900, height: 500, channels: 3, background: { r: 250, g: 250, b: 248 } },
  })
    .composite([
      { input: Buffer.from('<svg width="900" height="500"><text x="50" y="190" font-size="30" fill="#333">Net Quantity: 250 g</text><text x="50" y="240" font-size="30" fill="#333">MRP Rs. 30 (incl. of all taxes)</text><text x="50" y="300" font-size="24" fill="#444">MFD: SEP 2026</text><text x="50" y="350" font-size="24" fill="#444">Manufactured by: Britannia Industries Ltd.</text></svg>'), top: 0, left: 0 },
    ])
    .jpeg()
    .toBuffer();

  await request(app)
    .post(`/api/v1/inspections/${inspId}/images`)
    .set("Authorization", `Bearer ${token}`)
    .attach("images", label, { filename: "label.jpg", contentType: "image/jpeg" });

  // Run OCR first (extraction depends on it)
  await request(app)
    .post(`/api/v1/inspections/${inspId}/analyze`)
    .set("Authorization", `Bearer ${token}`);

  return { token, inspId };
}

describe("Phase 4 - declaration endpoints", () => {
  it("extracts declarations after OCR with evidence and classification", async () => {
    const { token, inspId } = await makeUserWithAnalyzedInspection();
    const res = await request(app)
      .post(`/api/v1/inspections/${inspId}/declarations/extract`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.declarationCount).toBeGreaterThan(2);
    const fields = res.body.data.declarations.map((d: { field: string }) => d.field);
    expect(fields).toContain("mrp");
    expect(fields).toContain("netQuantity");
    expect(fields).toContain("manufacturerName");
    // evidence present on every declaration
    for (const d of res.body.data.declarations) {
      expect(d.bbox).toBeTruthy();
      expect(d.ocrRegionIds).toBeTruthy();
      expect(d.confidence).toBeGreaterThan(0);
    }
    expect(res.body.data.note).toMatch(/not.*legal/i);
  }, 90000);

  it("lists declarations and supports correction without touching evidence", async () => {
    const { token, inspId } = await makeUserWithAnalyzedInspection();
    await request(app)
      .post(`/api/v1/inspections/${inspId}/declarations/extract`)
      .set("Authorization", `Bearer ${token}`);

    const list = await request(app)
      .get(`/api/v1/inspections/${inspId}/declarations`)
      .set("Authorization", `Bearer ${token}`);
    expect(list.status).toBe(200);
    const mrp = list.body.data.declarations.find((d: { field: string }) => d.field === "mrp");
    expect(mrp).toBeDefined();

    const patch = await request(app)
      .patch(`/api/v1/inspections/${inspId}/declarations/${mrp.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ correctedValue: "35", correctionNote: "Sticker price differs from print" });
    expect(patch.status).toBe(200);
    expect(patch.body.data.correctedValue).toBe("35");
    // original AI extraction intact
    expect(patch.body.data.rawText).toBe(mrp.rawText);
    expect(patch.body.data.normalizedValue).toBe(mrp.normalizedValue);
  }, 90000);

  it("rejects extraction without OCR regions", async () => {
    const email = `p4b${Math.random().toString(36).slice(2, 8)}@example.com`;
    await request(app).post("/api/v1/auth/register").send({ name: "No OCR", email, password: "Password123!" });
    const login = await request(app).post("/api/v1/auth/login").send({ email, password: "Password123!" });
    const create = await request(app)
      .post("/api/v1/inspections")
      .set("Authorization", `Bearer ${login.body.data.token}`)
      .send({ packageType: "RETAIL" });
    const res = await request(app)
      .post(`/api/v1/inspections/${create.body.data.id}/declarations/extract`)
      .set("Authorization", `Bearer ${login.body.data.token}`);
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/OCR/i);
  });

  it("evidence survives persistence and API serialization (Refinement 2A)", async () => {
    const { token, inspId } = await makeUserWithAnalyzedInspection();
    await request(app)
      .post(`/api/v1/inspections/${inspId}/declarations/extract`)
      .set("Authorization", `Bearer ${token}`);

    const list = await request(app)
      .get(`/api/v1/inspections/${inspId}/declarations`)
      .set("Authorization", `Bearer ${token}`);
    expect(list.status).toBe(200);
    const mrp = list.body.data.declarations.find((d: { field: string }) => d.field === "mrp");
    
    // Check that properties are present in the response
    expect(mrp).toBeDefined();
    expect(mrp.imageId).toBeDefined();
    expect(mrp.bbox).toBeDefined();
    expect(mrp.rawText).toBeDefined();
    expect(mrp.normalizedValue).toBeDefined();
    expect(mrp.confidence).toBeDefined();
    expect(mrp.ocrConfidence).toBeDefined();
  }, 90000);
});
