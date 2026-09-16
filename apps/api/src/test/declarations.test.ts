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

describe("Regression tests - upstream extraction enhancements (QNT Prime Whey)", () => {
  it("parses NET WT. 500g (1.1lbs) into quantity 500 and unit g", () => {
    const out = extractDeclarations([
      region("NET WT. 500g (1.1lbs)", "r-qty")
    ]);
    const qty = out.find(d => d.field === "netQuantity");
    expect(qty).toBeDefined();
    expect(qty!.normalizedValue).toBe("500");
    expect(qty!.unit).toBe("g");
    expect(qty!.bbox).toBeDefined();
    expect(qty!.ocrRegionIds).toContain("r-qty");
    expect(qty!.rawText).toBe("NET WT. 500g (1.1lbs)");
  });

  it("parses MRP ₹2199.00 into MRP 2199", () => {
    const out = extractDeclarations([
      region("MRP ₹2199.00", "r-mrp")
    ]);
    const mrp = out.find(d => d.field === "mrp");
    expect(mrp).toBeDefined();
    expect(mrp!.normalizedValue).toBe("2199");
    expect(mrp!.currency).toBe("INR");
    expect(mrp!.rawText).toBe("MRP ₹2199.00");
  });

  it("extracts and pairs 2-column table: MRP, Expiry (MAY-2028), Mfg Date (JUN-2026), Batch (QNT-26153)", () => {
    const tableRegions: OcrTextWithEvidence[] = [
      { id: "lbl-usp", text: "Unit sale price:", confidence: 0.97, bbox: [235, 651, 24, 124], imageId: "img1" },
      { id: "lbl-mrp", text: "MRP：", confidence: 0.97, bbox: [286, 648, 28, 65], imageId: "img1" },
      { id: "lbl-exp", text: "Expiry:", confidence: 0.99, bbox: [310, 649, 26, 54], imageId: "img1" },
      { id: "lbl-mfg", text: "Date of Mfg.:", confidence: 0.99, bbox: [336, 647, 28, 95], imageId: "img1" },
      { id: "lbl-batch", text: "Batch No.:", confidence: 0.99, bbox: [364, 647, 22, 76], imageId: "img1" },
      { id: "val-usp", text: "T398", confidence: 0.97, bbox: [273, 887, 22, 47], imageId: "img1" },
      { id: "val-mrp", text: "2199.00", confidence: 0.99, bbox: [286, 885, 25, 93], imageId: "img1" },
      { id: "val-exp", text: "MAY-2028", confidence: 0.99, bbox: [295, 883, 32, 97], imageId: "img1" },
      { id: "val-mfg", text: "JUN-2026", confidence: 0.99, bbox: [313, 885, 26, 89], imageId: "img1" },
      { id: "val-batch", text: "[QNT-26153", confidence: 0.91, bbox: [326, 885, 28, 85], imageId: "img1" },
    ];

    const out = extractDeclarations(tableRegions);

    const mrp = out.find(d => d.field === "mrp");
    expect(mrp?.normalizedValue).toBe("2199");

    const mfg = out.find(d => d.field === "manufactureDate");
    expect(mfg?.normalizedValue).toBe("2026-06");

    const exp = out.find(d => d.field === "useBy");
    expect(exp?.normalizedValue).toBe("2028-05");

    const batch = out.find(d => d.field === "batchNumber");
    expect(batch?.normalizedValue).toBe("QNT-26153");
  });

  it("extracts WHEY PROTEIN as genericName and does NOT treat marketing text as genericName", () => {
    const marketingText = "ONT FLAVORING SYSTEM MAINTAINS ITS PRODUCT PURITY WHILE ENSURING A GOOD MIXABILITY AND";
    const outMarketing = extractDeclarations([
      region(marketingText, "r-mktg")
    ]);
    const genMarketing = outMarketing.find(d => d.field === "genericName");
    expect(genMarketing).toBeUndefined();

    const outGeneric = extractDeclarations([
      region("WHEY PROTEIN", "r-gen")
    ]);
    const gen = outGeneric.find(d => d.field === "genericName");
    expect(gen).toBeDefined();
    expect(gen!.normalizedValue).toBe("WHEY PROTEIN");
  });

  it("does not allow manufacturer address to absorb complaint text and keeps phone and email separate", () => {
    const regions: OcrTextWithEvidence[] = [
      { id: "m1", text: "Manufactured by:BEL ENTERPRISES PVT. LTD., KR FOODS APC, Mini Food P", confidence: 0.93, bbox: [625, 642, 24, 319], imageId: "img1" },
      { id: "m2", text: "executive:+91-9711879978 writeatinfo@qntsport.in", confidence: 0.98, bbox: [640, 642, 18, 220], imageId: "img1" },
      { id: "m3", text: "18,Gurugram,Haryana-122015.For Complaints/feedback/suggestions,", confidence: 0.99, bbox: [652, 642, 22, 284], imageId: "img1" },
      { id: "m4", text: "Marketed by: QNT SPORT INDIA PVT: LTD., PIot no. 5, Electronic city, Aricent Lane, Sector", confidence: 0.96, bbox: [664, 640, 28, 401], imageId: "img1" },
    ];

    const out = extractDeclarations(regions);

    const mfrName = out.find(d => d.field === "manufacturerName");
    expect(mfrName?.normalizedValue).toBe("BEL ENTERPRISES PVT. LTD.");

    const mfrAddr = out.find(d => d.field === "manufacturerAddress");
    expect(mfrAddr).toBeDefined();
    expect(mfrAddr!.normalizedValue).toBe("18,Gurugram,Haryana-122015");
    expect(mfrAddr!.normalizedValue).not.toContain("Complaints");
    expect(mfrAddr!.normalizedValue).not.toContain("feedback");
    expect(mfrAddr!.normalizedValue).not.toContain("suggestions");

    const phone = out.find(d => d.field === "consumerCarePhone");
    expect(phone).toBeDefined();
    expect(phone!.normalizedValue).toBe("+919711879978");

    const email = out.find(d => d.field === "consumerCareEmail");
    expect(email).toBeDefined();
    expect(email!.normalizedValue).toBe("writeatinfo@qntsport.in");

    // Phone and email are strictly separate declarations
    expect(phone!.field).not.toBe(email!.field);
    expect(phone!.normalizedValue).not.toContain("@");
    expect(email!.normalizedValue).not.toContain("+91");
  });

  it("preserves evidence bbox, imageId, and rawText on all extracted declarations", () => {
    const regions: OcrTextWithEvidence[] = [
      { id: "r1", text: "MRP ₹2199.00", confidence: 0.95, bbox: [10, 20, 100, 30], imageId: "img-test-1" }
    ];
    const out = extractDeclarations(regions);
    const mrp = out.find(d => d.field === "mrp");
    expect(mrp).toBeDefined();
    expect(mrp!.rawText).toBe("MRP ₹2199.00");
    expect(mrp!.bbox).toEqual([10, 20, 100, 30]);
    expect(mrp!.ocrRegionIds).toEqual(["r1"]);
    expect(mrp!.confidence).toBeGreaterThan(0.8);
  });
  describe("Marketer declarations and Rule 6(1)(a) Explanation II", () => {
    it("Scenario A: extracts marketerName from single-region text", () => {
      const out = extractDeclarations([
        { id: "m1", text: "Marketed by: ABC Foods Ltd.", confidence: 0.95, bbox: [100, 200, 250, 30], imageId: "img1" }
      ]);
      const marketer = out.find(d => d.field === "marketerName");
      expect(marketer).toBeDefined();
      expect(marketer!.normalizedValue).toBe("ABC Foods Ltd.");
      expect(marketer!.rawText).toBe("Marketed by: ABC Foods Ltd.");
      expect(marketer!.detectionMethod).toBe("regex:entity-name");
    });

    it("Scenario B: extracts marketerName when label and company name are separate vertical regions in the same column", () => {
      const regions: OcrTextWithEvidence[] = [
        { id: "reg-label", text: "MARKETED BY:", confidence: 0.95, bbox: [1072, 1627, 200, 25], imageId: "img1" },
        { id: "reg-comp", text: "PepsiCo India Holdings Pvt. Ltd.", confidence: 0.96, bbox: [1071, 1659, 350, 25], imageId: "img1" }
      ];
      const out = extractDeclarations(regions);
      const marketer = out.find(d => d.field === "marketerName");
      expect(marketer).toBeDefined();
      expect(marketer!.normalizedValue).toBe("PepsiCo India Holdings Pvt. Ltd.");
      expect(marketer!.rawText).toBe("MARKETED BY: PepsiCo India Holdings Pvt. Ltd.");
      expect(marketer!.detectionMethod).toBe("regex:entity-name:paired");
      expect(marketer!.bbox).toEqual([1071, 1659, 350, 25]);
      expect(marketer!.ocrRegionIds).toEqual(["reg-label", "reg-comp"]);
    });

    it("Scenario C: extracts multi-region marketer address block associated with marketer", () => {
      const regions: OcrTextWithEvidence[] = [
        { id: "rA", text: "MARKETED BY:", confidence: 0.95, bbox: [1072, 1627, 200, 25], imageId: "img1" },
        { id: "rB", text: "PepsiCo India Holdings Pvt. Ltd.", confidence: 0.96, bbox: [1071, 1659, 350, 25], imageId: "img1" },
        { id: "rC", text: "P.O.BOX-27, DLF QUTAB ENCLAVE, PHASE-1", confidence: 0.94, bbox: [1072, 1700, 320, 20], imageId: "img1" },
        { id: "rD", text: "GURUGRAM - 122002, HARYANA, INDIA.", confidence: 0.97, bbox: [1072, 1730, 280, 20], imageId: "img1" },
      ];
      const out = extractDeclarations(regions);
      const marketer = out.find(d => d.field === "marketerName");
      const addr = out.find(d => d.field === "marketerAddress");

      expect(marketer).toBeDefined();
      expect(marketer!.normalizedValue).toBe("PepsiCo India Holdings Pvt. Ltd.");

      expect(addr).toBeDefined();
      expect(addr!.normalizedValue).toBe("P.O.BOX-27, DLF QUTAB ENCLAVE, PHASE-1, GURUGRAM - 122002, HARYANA, INDIA.");
      expect(addr!.ocrRegionIds).toEqual(["rC", "rD"]);
      expect(addr!.detectionMethod).toBe("heuristic:address-neighbor");
      expect(addr!.bbox).toEqual([1072, 1700, 320, 20]);
    });

    it("Scenario D: does NOT extract standalone marketer label alone as company name", () => {
      const regions: OcrTextWithEvidence[] = [
        { id: "rA", text: "MARKETED BY:", confidence: 0.95, bbox: [1072, 1627, 200, 25], imageId: "img1" }
      ];
      const out = extractDeclarations(regions);
      const marketer = out.find(d => d.field === "marketerName");
      expect(marketer).toBeUndefined();
    });

    it("Scenario E: correctly handles cross-column isolation with interleaved OCR sequence", () => {
      const regions: OcrTextWithEvidence[] = [
        { id: "seq-90", text: "MARKETED BY:", confidence: 0.95, bbox: [1072, 1627, 200, 25], imageId: "img1" },
        { id: "seq-91", text: "Energy 540 kcal", confidence: 0.92, bbox: [200, 1630, 150, 20], imageId: "img1" },
        { id: "seq-92", text: "Protein 6.0 g", confidence: 0.93, bbox: [200, 1655, 150, 20], imageId: "img1" },
        { id: "seq-97", text: "Britannia Industries Ltd.", confidence: 0.97, bbox: [1070, 1660, 300, 25], imageId: "img1" },
      ];
      const out = extractDeclarations(regions);
      const marketer = out.find(d => d.field === "marketerName");
      expect(marketer).toBeDefined();
      expect(marketer!.normalizedValue).toBe("Britannia Industries Ltd.");
      expect(marketer!.ocrRegionIds).toEqual(["seq-90", "seq-97"]);
    });

    it("Scenario F: works for any generic entity name (not hardcoded to PepsiCo)", () => {
      const regions: OcrTextWithEvidence[] = [
        { id: "r1", text: "MARKETED BY:", confidence: 0.95, bbox: [500, 600, 180, 25], imageId: "img1" },
        { id: "r2", text: "Haldiram Snacks Pvt. Ltd.", confidence: 0.95, bbox: [502, 630, 250, 25], imageId: "img1" },
        { id: "r3", text: "Plot No. 12, Sector 58, Noida - 201301, U.P.", confidence: 0.94, bbox: [500, 665, 300, 25], imageId: "img1" },
      ];
      const out = extractDeclarations(regions);
      const marketer = out.find(d => d.field === "marketerName");
      const addr = out.find(d => d.field === "marketerAddress");

      expect(marketer).toBeDefined();
      expect(marketer!.normalizedValue).toBe("Haldiram Snacks Pvt. Ltd.");
      expect(addr).toBeDefined();
      expect(addr!.normalizedValue).toBe("Plot No. 12, Sector 58, Noida - 201301, U.P.");
    });

    it("Scenario G: full Kurkure package geometry with interleaved regions", () => {
      const kurkureRegions: OcrTextWithEvidence[] = [
        { id: "seq-90", text: "MARKETED BY:", confidence: 0.98, bbox: [1072, 1627, 185, 24], imageId: "img1" },
        { id: "seq-91", text: "Nutritional Information per 100g", confidence: 0.95, bbox: [250, 1630, 220, 20], imageId: "img1" },
        { id: "seq-92", text: "Energy: 558 kcal", confidence: 0.94, bbox: [250, 1652, 150, 20], imageId: "img1" },
        { id: "seq-97", text: "PepsiCo India Holdings Pvt. Ltd.", confidence: 0.99, bbox: [1071, 1659, 310, 26], imageId: "img1" },
        { id: "seq-98", text: "Carbohydrates: 56.4 g", confidence: 0.92, bbox: [250, 1675, 160, 20], imageId: "img1" },
        { id: "seq-135", text: "P.O.BOX-27, DLF QUTAB ENCLAVE, PHASE-1", confidence: 0.97, bbox: [1072, 1700, 335, 22], imageId: "img1" },
        { id: "seq-136", text: "Total Sugars: 1.5 g", confidence: 0.91, bbox: [250, 1698, 140, 20], imageId: "img1" },
        { id: "seq-139", text: "GURUGRAM - 122002, HARYANA, INDIA.", confidence: 0.98, bbox: [1072, 1728, 290, 22], imageId: "img1" },
      ];
      const out = extractDeclarations(kurkureRegions);

      const marketer = out.find(d => d.field === "marketerName");
      expect(marketer).toBeDefined();
      expect(marketer!.normalizedValue).toBe("PepsiCo India Holdings Pvt. Ltd.");
      expect(marketer!.rawText).toBe("MARKETED BY: PepsiCo India Holdings Pvt. Ltd.");
      expect(marketer!.bbox).toEqual([1071, 1659, 310, 26]);
      expect(marketer!.ocrRegionIds).toEqual(["seq-90", "seq-97"]);

      const addr = out.find(d => d.field === "marketerAddress");
      expect(addr).toBeDefined();
      expect(addr!.normalizedValue).toBe("P.O.BOX-27, DLF QUTAB ENCLAVE, PHASE-1, GURUGRAM - 122002, HARYANA, INDIA.");
      expect(addr!.normalizedValue).not.toBe("PepsiCo India Holdings Pvt. Ltd.");
      expect(addr!.normalizedValue).not.toBe(marketer!.normalizedValue);
      expect(addr!.normalizedValue).toContain("GURUGRAM - 122002");
      expect(addr!.ocrRegionIds).toEqual(["seq-135", "seq-139"]);
    });

    it("Scenario H: explicit manufacturer and packer declarations remain unaffected", () => {
      const regions: OcrTextWithEvidence[] = [
        { id: "mfg1", text: "Manufactured by: Tasty Bites Foods Ltd.", confidence: 0.95, bbox: [100, 100, 300, 25], imageId: "img1" },
        { id: "mfg2", text: "Survey No. 45, Pune, Maharashtra 411001", confidence: 0.93, bbox: [100, 130, 300, 25], imageId: "img1" },
        { id: "mkt1", text: "MARKETED BY: Global Brands India Pvt. Ltd.", confidence: 0.94, bbox: [100, 200, 300, 25], imageId: "img1" },
      ];
      const out = extractDeclarations(regions);

      const mfrName = out.find(d => d.field === "manufacturerName");
      expect(mfrName).toBeDefined();
      expect(mfrName!.normalizedValue).toBe("Tasty Bites Foods Ltd.");

      const mfrAddr = out.find(d => d.field === "manufacturerAddress");
      expect(mfrAddr).toBeDefined();
      expect(mfrAddr!.normalizedValue).toBe("Survey No. 45, Pune, Maharashtra 411001");

      const mktName = out.find(d => d.field === "marketerName");
      expect(mktName).toBeDefined();
      expect(mktName!.normalizedValue).toBe("Global Brands India Pvt. Ltd.");
    });

    it("Scenario I: packer extraction regression", () => {
      const regions: OcrTextWithEvidence[] = [
        { id: "pk1", text: "Packed by: Alpha Packagers Ltd.", confidence: 0.95, bbox: [100, 100, 300, 25], imageId: "img1" },
        { id: "pk2", text: "Plot 10, Okhla Phase 3, New Delhi - 110020", confidence: 0.93, bbox: [100, 130, 300, 25], imageId: "img1" },
      ];
      const out = extractDeclarations(regions);
      const pkName = out.find(d => d.field === "packerName");
      const pkAddr = out.find(d => d.field === "packerAddress");
      expect(pkName).toBeDefined();
      expect(pkName!.normalizedValue).toBe("Alpha Packagers Ltd.");
      expect(pkAddr).toBeDefined();
      expect(pkAddr!.normalizedValue).toBe("Plot 10, Okhla Phase 3, New Delhi - 110020");
    });

    it("Scenario J: importer extraction regression", () => {
      const regions: OcrTextWithEvidence[] = [
        { id: "imp1", text: "Imported by: Omega Imports Pvt. Ltd.", confidence: 0.95, bbox: [100, 100, 300, 25], imageId: "img1" },
        { id: "imp2", text: "Andheri East, Mumbai, Maharashtra 400069", confidence: 0.93, bbox: [100, 130, 300, 25], imageId: "img1" },
      ];
      const out = extractDeclarations(regions);
      const impName = out.find(d => d.field === "importerName");
      const impAddr = out.find(d => d.field === "importerAddress");
      expect(impName).toBeDefined();
      expect(impName!.normalizedValue).toBe("Omega Imports Pvt. Ltd.");
      expect(impAddr).toBeDefined();
      expect(impAddr!.normalizedValue).toBe("Andheri East, Mumbai, Maharashtra 400069");
    });

    it("Scenario K: different entities in different columns without cross-column contamination", () => {
      const regions: OcrTextWithEvidence[] = [
        { id: "col1-mfg", text: "MANUFACTURED BY: Alpha Foods Ltd.", confidence: 0.97, bbox: [100, 200, 200, 25], imageId: "img1" },
        { id: "col1-mfg-addr", text: "Industrial Area, Sector 5, Haridwar 249403", confidence: 0.95, bbox: [100, 260, 300, 25], imageId: "img1" },
        { id: "col2-mkt", text: "MARKETED BY:", confidence: 0.97, bbox: [600, 200, 200, 25], imageId: "img1" },
        { id: "col2-mkt-name", text: "Beta Consumer Brands Ltd.", confidence: 0.96, bbox: [600, 230, 250, 25], imageId: "img1" },
        { id: "col2-mkt-addr", text: "DLF Cyber City, Gurugram 122002", confidence: 0.95, bbox: [600, 260, 300, 25], imageId: "img1" },
      ];
      const out = extractDeclarations(regions);

      const mfrName = out.find(d => d.field === "manufacturerName");
      expect(mfrName?.normalizedValue).toBe("Alpha Foods Ltd.");

      const mfrAddr = out.find(d => d.field === "manufacturerAddress");
      expect(mfrAddr?.normalizedValue).toBe("Industrial Area, Sector 5, Haridwar 249403");

      const mktName = out.find(d => d.field === "marketerName");
      expect(mktName?.normalizedValue).toBe("Beta Consumer Brands Ltd.");

      const mktAddr = out.find(d => d.field === "marketerAddress");
      expect(mktAddr?.normalizedValue).toBe("DLF Cyber City, Gurugram 122002");

      expect(mktAddr?.normalizedValue).not.toContain("Haridwar");
      expect(mfrAddr?.normalizedValue).not.toContain("Gurugram");
      expect(mktAddr?.normalizedValue).not.toBe(mktName?.normalizedValue);
    });
  });

});
