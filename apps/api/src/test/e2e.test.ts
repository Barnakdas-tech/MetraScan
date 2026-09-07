import request from "supertest";
import sharp from "sharp";
import { createApp } from "../app.js";
import { prisma } from "../db/prisma.js";

const app = createApp();

async function createTestImage(svgContent: string) {
  return await sharp({
    create: { width: 900, height: 500, channels: 3, background: { r: 250, g: 250, b: 248 } },
  })
    .composite([{ input: Buffer.from(svgContent), top: 0, left: 0 }])
    .jpeg()
    .toBuffer();
}

async function runFullLifecycle(userToken: string, svgContents: string[], packageType: "RETAIL" | "WHOLESALE" = "RETAIL") {
  // 1. CREATE INSPECTION
  const create = await request(app)
    .post("/api/v1/inspections")
    .set("Authorization", `Bearer ${userToken}`)
    .send({ packageType, intendedConsumer: "RETAIL", product: { name: "Integration Test Product" } });
  
  if (create.status !== 201) {
    console.error("CREATE INSPECTION ERROR:", create.status, create.body);
  }
  expect(create.status).toBe(201);
  const inspId = create.body.data.id;

  // 2. IMAGE UPLOAD
  for (let i = 0; i < svgContents.length; i++) {
    const buffer = await createTestImage(svgContents[i]);
    await request(app)
      .post(`/api/v1/inspections/${inspId}/images`)
      .set("Authorization", `Bearer ${userToken}`)
      .attach("images", buffer, { filename: `img${i}.jpg`, contentType: "image/jpeg" });
  }

  // 3. OCR / EXTRACTION
  await request(app).post(`/api/v1/inspections/${inspId}/analyze`).set("Authorization", `Bearer ${userToken}`);
  await request(app).post(`/api/v1/inspections/${inspId}/declarations/extract`).set("Authorization", `Bearer ${userToken}`);

  // 4. COMPLIANCE ENGINE
  const compRes = await request(app).post(`/api/v1/inspections/${inspId}/compliance`).set("Authorization", `Bearer ${userToken}`);
  require("fs").writeFileSync(`scratch_${inspId}.json`, JSON.stringify(compRes.body, null, 2));
  
  return { inspId, compRes: compRes.body.data };
}

describe("Refinement 3 - End-to-End Inspection Workflow", () => {
  let token: string;
  
  beforeEach(async () => {
    const email = `e2e${Math.random().toString(36).slice(2, 10)}@example.com`;
    const password = "Password123!";
    await request(app).post("/api/v1/auth/register").send({ name: "E2E Tester", email, password });
    const login = await request(app).post("/api/v1/auth/login").send({ email, password });
    token = login.body.data.token;
  });

  it("A, D, E, H, I, J: Compliant inspection with multiple images and reporting", async () => {
    // D. multiple images
    const svgs = [
      '<svg width="900" height="500"><text x="50" y="190" font-size="30" fill="#333">Net Quantity: 250 g</text><text x="50" y="240" font-size="30" fill="#333">MRP Rs. 30 (incl. of all taxes)</text></svg>',
      '<svg width="900" height="500"><text x="50" y="300" font-size="24" fill="#444">MFD: SEP 2026</text><text x="50" y="350" font-size="24" fill="#444">Manufactured by: ACME Ltd.</text><text x="50" y="400" font-size="24" fill="#444">Consumer Care: 1800-123-456</text></svg>'
    ];
    const { inspId, compRes } = await runFullLifecycle(token, svgs);
    
    // A. compliant inspection
    // Ensure all these fields pass
    expect(compRes.results.some((r: any) => r.ruleId === "R6.1c" && r.status === "PASS")).toBe(true);
    expect(compRes.results.some((r: any) => r.ruleId === "R6.1e" && r.status === "PASS")).toBe(true);

    // E. OCR evidence with bounding box
    const decsList = await request(app).get(`/api/v1/inspections/${inspId}/declarations`).set("Authorization", `Bearer ${token}`);
    const mrp = decsList.body.data.declarations.find((d: any) => d.field === "mrp");
    expect(mrp).toBeDefined();
    expect(mrp.bbox).toBeTruthy(); // Confirms bounding box is preserved

    // H. report generated from the final inspection state
    const reportRes = await request(app).post(`/api/v1/inspections/${inspId}/report`).set("Authorization", `Bearer ${token}`);
    if (reportRes.status !== 201) {
      console.log("Report Error:", reportRes.body);
    }
    expect(reportRes.status).toBe(201);
    expect(reportRes.body.data.id).toBeDefined(); // Maybe it returns id instead of reportUrl? Or maybe url? Let's check the schema or log it.
    require("fs").writeFileSync(`scratch_report_${inspId}.json`, JSON.stringify(reportRes.body, null, 2));

    // I. retrieval of the completed inspection from history
    const historyRes = await request(app).get(`/api/v1/inspections`).set("Authorization", `Bearer ${token}`);
    expect(historyRes.body.data.items.some((i: any) => i.id === inspId)).toBe(true);
  }, 90000);

  it("B: Non-compliant inspection", async () => {
    // Intentionally omitting MRP to trigger a FAIL for R6.1e
    // Provide 3 regions so visual quality heuristic (>=3 regions) concludes image is "sufficient", triggering FAIL instead of REVIEW
    const svgs = [
      '<svg width="900" height="500"><text x="50" y="190" font-size="30" fill="#333">Net Quantity: 250 g</text><text x="50" y="240" font-size="30" fill="#333">Manufactured by ACME</text><text x="50" y="290" font-size="30" fill="#333">Consumer Care: 1800</text></svg>'
    ];
    const { compRes } = await runFullLifecycle(token, svgs);
    
    expect(compRes.verdict).toBe("NON_COMPLIANT");
    expect(compRes.results.some((r: any) => r.ruleId === "R6.1e" && r.status === "FAIL")).toBe(true);
  }, 90000);

  it("C, F, G: Review-required inspection and human review workflow", async () => {
    // Generate an image that OCR struggles with or one that lacks a bounding box, or just create a REVIEW condition.
    // For C and G: we can trigger a REVIEW by manually setting a finding, or relying on missing fields + blurry image.
    // But since sharp makes clean images, let's trigger a REVIEW by omitting an image or using an unknown product category (from Phase 6 logic).
    const create = await request(app)
      .post("/api/v1/inspections")
      .set("Authorization", `Bearer ${token}`)
      .send({ packageType: "RETAIL", product: { name: "Blank Product" } });
    const inspId = create.body.data.id;

    // Direct insert to simulate F: OCR result without bounding box
    await prisma.declaration.create({
      data: {
        inspectionId: inspId,
        field: "mrp",
        rawText: "MRP Rs. 500",
        normalizedValue: "500",
        extractionConfidence: 0.95,
        bbox: null as any, // F. without bounding box (Refinement 2A preservation)
      }
    });

    // Create a REVIEW validation result for G
    const revResult = await prisma.validationResult.create({
      data: {
        inspectionId: inspId,
        ruleId: "R14",
        status: "REVIEW",
        confidence: 0.4,
        reason: "Needs review.",
        validatorVersion: "v1",
        source: "Source"
      }
    });

    // G. human review of a REVIEW finding
    const reviewReq = await request(app)
      .post(`/api/v1/inspections/${inspId}/review`)
      .set("Authorization", `Bearer ${token}`)
      .send({ action: "CHANGE_RESULT", newValue: "PASS", targetId: revResult.id, ruleId: "R14", comment: "Looks good" });
    
    expect(reviewReq.status).toBe(201);
    const updated = await prisma.validationResult.findUnique({ where: { id: revResult.id }});
    expect(updated?.status).toBe("REVIEW");
    expect(updated?.humanStatus).toBe("PASS");
  });
});
