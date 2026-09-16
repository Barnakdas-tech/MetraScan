import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import sharp from "sharp";
import { createApp } from "../app.js";
import { prisma } from "../db/prisma.js";
import {
  areCandidatesConflicting,
  resolveFieldConflicts,
  type FieldCandidateWithImage,
} from "../extractors/conflictDetector.js";
import type { FieldCandidate } from "../extractors/types.js";
import { evaluateCompliance } from "@metrascan/legal-engine";
import type { ApplicabilityInput, DeclarationEvidence, VisualEvidence } from "@metrascan/legal-engine";

const app = createApp();

function candidate(
  field: string,
  rawText: string,
  normalizedValue: string,
  conf = 0.9,
  extra: Partial<FieldCandidate> = {}
): FieldCandidate {
  return {
    field,
    rawText,
    normalizedValue,
    confidence: conf,
    ocrConfidence: 0.9,
    detectionMethod: "RULE_BASED",
    bbox: [10, 20, 30, 40],
    ocrRegionIds: ["r1"],
    ...extra,
  };
}

async function makeUser() {
  const email = `conflict_tester_${Math.random().toString(36).slice(2, 10)}@example.com`;
  const password = "Password123!";
  await request(app).post("/api/v1/auth/register").send({ name: "Conflict Tester", email, password });
  const login = await request(app).post("/api/v1/auth/login").send({ email, password });
  return { token: login.body.data.token as string };
}

async function createSvgImage(svgContent: string) {
  return await sharp({
    create: { width: 900, height: 500, channels: 3, background: { r: 250, g: 250, b: 248 } },
  })
    .composite([{ input: Buffer.from(svgContent), top: 0, left: 0 }])
    .jpeg()
    .toBuffer();
}

describe("Cross-Image Declaration Conflict Handling", () => {
  describe("Unit tests: areCandidatesConflicting & resolveFieldConflicts", () => {
    it("CASE 1 & 6: Same MRP and formatting-only differences do NOT conflict", () => {
      // Exactly same value
      const c1 = candidate("mrp", "MRP Rs. 30", "30", 0.95, { currency: "INR" });
      const c2 = candidate("mrp", "MRP Rs. 30", "30", 0.85, { currency: "INR" });
      expect(areCandidatesConflicting(c1, c2)).toBe(false);

      // Formatting difference: ₹2,199 vs Rs. 2199.00 vs 2199 INR
      const c3 = candidate("mrp", "MRP ₹2,199.00", "2199", 0.95, { currency: "INR" });
      const c4 = candidate("mrp", "Rs. 2199", "2199", 0.80, { currency: "INR" });
      expect(areCandidatesConflicting(c3, c4)).toBe(false);
    });

    it("CASE 2: Different MRP values across images trigger a conflict", () => {
      const c1 = candidate("mrp", "MRP ₹2199", "2199", 0.80, { currency: "INR" });
      const c2 = candidate("mrp", "MRP ₹1999", "1999", 0.95, { currency: "INR" });
      expect(areCandidatesConflicting(c1, c2)).toBe(true);
    });

    it("CASE 3 & 6: Net quantity comparison handles unit conversions and detects conflicts", () => {
      // Same quantity and unit
      const q1 = candidate("netQuantity", "Net Qty: 500 g", "500", 0.9, { unit: "g" });
      const q2 = candidate("netQuantity", "500g", "500", 0.85, { unit: "g" });
      expect(areCandidatesConflicting(q1, q2)).toBe(false);

      // Unit conversion match: 500 g vs 0.5 kg
      const q3 = candidate("netQuantity", "0.5 kg", "0.5", 0.88, { unit: "kg" });
      expect(areCandidatesConflicting(q1, q3)).toBe(false);

      // Different quantity: 500 g vs 400 g
      const q4 = candidate("netQuantity", "400 g", "400", 0.92, { unit: "g" });
      expect(areCandidatesConflicting(q1, q4)).toBe(true);

      // Incompatible units: 500 g vs 500 ml
      const q5 = candidate("netQuantity", "500 ml", "500", 0.92, { unit: "ml" });
      expect(areCandidatesConflicting(q1, q5)).toBe(true);
    });

    it("CASE 4: Different manufacturer information triggers conflict", () => {
      // Formatting differences: Pvt. Ltd. vs Private Limited
      const m1 = candidate("manufacturerName", "BEL ENTERPRISES PVT. LTD.", "BEL ENTERPRISES PVT. LTD.");
      const m2 = candidate("manufacturerName", "Bel Enterprises Private Limited", "Bel Enterprises Private Limited");
      expect(areCandidatesConflicting(m1, m2)).toBe(false);

      // Different company names
      const m3 = candidate("manufacturerName", "ABC Pvt Ltd", "ABC Pvt Ltd");
      const m4 = candidate("manufacturerName", "XYZ Pvt Ltd", "XYZ Pvt Ltd");
      expect(areCandidatesConflicting(m3, m4)).toBe(true);
    });

    it("Different marketer information triggers conflict", () => {
      // Formatting differences: Pvt. Ltd. vs Private Limited
      const m1 = candidate("marketerName", "MARKETED BY: PepsiCo India Holdings Pvt. Ltd.", "PepsiCo India Holdings Pvt. Ltd.");
      const m2 = candidate("marketerName", "Marketed by: PepsiCo India Holdings Private Limited", "PepsiCo India Holdings Private Limited");
      expect(areCandidatesConflicting(m1, m2)).toBe(false);

      // Different company names
      const m3 = candidate("marketerName", "PepsiCo India Holdings Pvt Ltd", "PepsiCo India Holdings Pvt Ltd");
      const m4 = candidate("marketerName", "Britannia Industries Ltd", "Britannia Industries Ltd");
      expect(areCandidatesConflicting(m3, m4)).toBe(true);

      // Conflicting marketer addresses
      const a1 = candidate("marketerAddress", "DLF Phase-1, Gurugram 122002", "DLF Phase-1, Gurugram 122002");
      const a2 = candidate("marketerAddress", "MG Road, Bengaluru 560001", "MG Road, Bengaluru 560001");
      expect(areCandidatesConflicting(a1, a2)).toBe(true);

      // Same marketer address formatting
      const a3 = candidate("marketerAddress", "P.O.BOX-27, DLF QUTAB ENCLAVE, PHASE-1, GURUGRAM - 122002", "P.O.BOX-27, DLF QUTAB ENCLAVE, PHASE-1, GURUGRAM - 122002");
      const a4 = candidate("marketerAddress", "P.O. Box 27, DLF Qutab Enclave, Phase 1, Gurugram 122002", "P.O. Box 27, DLF Qutab Enclave, Phase 1, Gurugram 122002");
      expect(areCandidatesConflicting(a3, a4)).toBe(false);
    });

    it("CASE 7: Different fields across front/back are NOT treated as conflicts", () => {
      const frontGeneric = candidate("genericName", "Whey Protein Isolate", "Whey Protein Isolate");
      const backMfr = candidate("manufacturerName", "BEL ENTERPRISES PVT. LTD.", "BEL ENTERPRISES PVT. LTD.");
      expect(areCandidatesConflicting(frontGeneric, backMfr)).toBe(false);
    });

    it("Preserves provenance for both candidates in resolveFieldConflicts", () => {
      const candidates: FieldCandidateWithImage[] = [
        { ...candidate("mrp", "MRP ₹2199", "2199", 0.80, { currency: "INR", bbox: [1, 2, 3, 4] }), imageId: "img-front" },
        { ...candidate("mrp", "MRP ₹1999", "1999", 0.95, { currency: "INR", bbox: [5, 6, 7, 8] }), imageId: "img-back" },
      ];

      const resolved = resolveFieldConflicts(candidates);
      expect(resolved.has("mrp")).toBe(true);
      const mrpDecl = resolved.get("mrp")!;

      // Primary candidate is highest confidence (Image 2 with 0.95)
      expect(mrpDecl.primary.imageId).toBe("img-back");
      expect(mrpDecl.primary.normalizedValue).toBe("1999");
      expect(mrpDecl.primary.confidence).toBe(0.95);

      // Conflicting candidate is Image 1 with complete provenance
      expect(mrpDecl.conflicts).toHaveLength(1);
      const conf = mrpDecl.conflicts[0];
      expect(conf.imageId).toBe("img-front");
      expect(conf.normalizedValue).toBe("2199");
      expect(conf.confidence).toBe(0.80);
      expect(conf.bbox).toEqual([1, 2, 3, 4]);
    });
  });

  describe("End-to-End Workflow with Multi-Image Conflict Handling", () => {
    let token: string;

    beforeEach(async () => {
      const user = await makeUser();
      token = user.token;
    });

    it("1. Complementary declarations across two images -> PASS", async () => {
      const insp = await request(app)
        .post("/api/v1/inspections")
        .set("Authorization", `Bearer ${token}`)
        .send({ packageType: "RETAIL", intendedConsumer: "RETAIL" });
      const inspId = insp.body.data.id;

      // Front: Net quantity & MRP
      const frontBuf = await createSvgImage(`
        <svg width="900" height="500">
          <text x="50" y="150" font-size="30">Net Quantity: 250 g</text>
          <text x="50" y="220" font-size="30">MRP Rs. 30 (incl. of all taxes)</text>
          <text x="50" y="290" font-size="26">Whey Protein Isolate</text>
        </svg>
      `);
      // Back: MFD, MFR, Consumer Care
      const backBuf = await createSvgImage(`
        <svg width="900" height="500">
          <text x="50" y="150" font-size="24">MFD: SEP 2026</text>
          <text x="50" y="220" font-size="24">Manufactured by: ACME Ltd, 12 Park Street, Kolkata - 700016</text>
          <text x="50" y="290" font-size="24">Consumer Care: 1800-123-456</text>
        </svg>
      `);

      await request(app).post(`/api/v1/inspections/${inspId}/images`).set("Authorization", `Bearer ${token}`).attach("images", frontBuf, "front.jpg");
      await request(app).post(`/api/v1/inspections/${inspId}/images`).set("Authorization", `Bearer ${token}`).attach("images", backBuf, "back.jpg");

      await request(app).post(`/api/v1/inspections/${inspId}/analyze`).set("Authorization", `Bearer ${token}`);
      const extRes = await request(app).post(`/api/v1/inspections/${inspId}/declarations/extract`).set("Authorization", `Bearer ${token}`);

      // Ensure no false conflicts
      const mrpDecl = extRes.body.data.declarations.find((d: any) => d.field === "mrp");
      expect(mrpDecl.conflicts).toBeFalsy();

      const compRes = await request(app).post(`/api/v1/inspections/${inspId}/compliance`).set("Authorization", `Bearer ${token}`);
      const r61e = compRes.body.data.results.find((r: any) => r.ruleId === "R6.1e");
      const r61c = compRes.body.data.results.find((r: any) => r.ruleId === "R6.1c");
      expect(r61e.status).toBe("PASS");
      expect(r61c.status).toBe("PASS");
    }, 60000);

    it("2. Same MRP on two images -> no conflict, remains valid", async () => {
      const insp = await request(app)
        .post("/api/v1/inspections")
        .set("Authorization", `Bearer ${token}`)
        .send({ packageType: "RETAIL", intendedConsumer: "RETAIL" });
      const inspId = insp.body.data.id;

      // Both images have identical MRP
      const img1Buf = await createSvgImage(`
        <svg width="900" height="500">
          <text x="50" y="150" font-size="30">MRP Rs. 30 (incl. of all taxes)</text>
          <text x="50" y="220" font-size="30">Net Quantity: 250 g</text>
        </svg>
      `);
      const img2Buf = await createSvgImage(`
        <svg width="900" height="500">
          <text x="50" y="150" font-size="30">MRP Rs. 30 (incl. of all taxes)</text>
          <text x="50" y="220" font-size="24">Manufactured by ACME Ltd, 12 Park Street, Kolkata - 700016</text>
          <text x="50" y="290" font-size="24">Consumer Care: 1800-123-456</text>
        </svg>
      `);

      await request(app).post(`/api/v1/inspections/${inspId}/images`).set("Authorization", `Bearer ${token}`).attach("images", img1Buf, "img1.jpg");
      await request(app).post(`/api/v1/inspections/${inspId}/images`).set("Authorization", `Bearer ${token}`).attach("images", img2Buf, "img2.jpg");

      await request(app).post(`/api/v1/inspections/${inspId}/analyze`).set("Authorization", `Bearer ${token}`);
      const extRes = await request(app).post(`/api/v1/inspections/${inspId}/declarations/extract`).set("Authorization", `Bearer ${token}`);

      const mrpDecl = extRes.body.data.declarations.find((d: any) => d.field === "mrp");
      expect(mrpDecl).toBeDefined();
      expect(mrpDecl.conflicts).toBeFalsy();

      const compRes = await request(app).post(`/api/v1/inspections/${inspId}/compliance`).set("Authorization", `Bearer ${token}`);
      const r61e = compRes.body.data.results.find((r: any) => r.ruleId === "R6.1e");
      expect(r61e.status).toBe("PASS");
    }, 60000);

    it("3. Different MRP across two images -> conflict detected, REVIEW, both image IDs preserved", async () => {
      const insp = await request(app)
        .post("/api/v1/inspections")
        .set("Authorization", `Bearer ${token}`)
        .send({ packageType: "RETAIL", intendedConsumer: "RETAIL" });
      const inspId = insp.body.data.id;

      // Image 1: MRP Rs. 30
      const img1Buf = await createSvgImage(`
        <svg width="900" height="500">
          <text x="50" y="80" font-size="30">Generic Name: Chocolate Biscuits</text>
          <text x="50" y="150" font-size="30">MRP Rs. 30 (incl. of all taxes)</text>
          <text x="50" y="220" font-size="30">Net Quantity: 250 g</text>
          <text x="50" y="290" font-size="24">Manufactured by: ACME Ltd, 12 Park Street, Kolkata - 700016</text>
        </svg>
      `);
      // Image 2: MRP Rs. 40
      const img2Buf = await createSvgImage(`
        <svg width="900" height="500">
          <text x="50" y="150" font-size="30">MRP Rs. 40 (incl. of all taxes)</text>
          <text x="50" y="220" font-size="24">Consumer Care: 1800-123-456</text>
          <text x="50" y="290" font-size="24">MFD: SEP 2026</text>
        </svg>
      `);

      const up1 = await request(app).post(`/api/v1/inspections/${inspId}/images`).set("Authorization", `Bearer ${token}`).attach("images", img1Buf, "front.jpg");
      const up2 = await request(app).post(`/api/v1/inspections/${inspId}/images`).set("Authorization", `Bearer ${token}`).attach("images", img2Buf, "back.jpg");
      const img1Id = up1.body.data.uploaded[0].id;
      const img2Id = up2.body.data.uploaded[0].id;

      await request(app).post(`/api/v1/inspections/${inspId}/analyze`).set("Authorization", `Bearer ${token}`);
      const extRes = await request(app).post(`/api/v1/inspections/${inspId}/declarations/extract`).set("Authorization", `Bearer ${token}`);

      const mrpDecl = extRes.body.data.declarations.find((d: any) => d.field === "mrp");
      expect(mrpDecl).toBeDefined();
      expect(mrpDecl.conflicts).toBeDefined();
      expect(mrpDecl.conflicts.length).toBeGreaterThan(0);

      // Verify both image IDs are accounted for
      const primaryImageId = mrpDecl.imageId;
      const conflictImageId = mrpDecl.conflicts[0].imageId;
      const imagesInvolved = new Set([primaryImageId, conflictImageId]);
      expect(imagesInvolved.has(img1Id)).toBe(true);
      expect(imagesInvolved.has(img2Id)).toBe(true);

      // Compliance evaluation
      const compRes = await request(app).post(`/api/v1/inspections/${inspId}/compliance`).set("Authorization", `Bearer ${token}`);
      const r61e = compRes.body.data.results.find((r: any) => r.ruleId === "R6.1e");
      expect(r61e.status).toBe("REVIEW");
      expect(r61e.reason).toMatch(/conflicting.*mrp/i);
      expect(compRes.body.data.verdict).toBe("REVIEW_REQUIRED");
    }, 60000);

    it("4. Different net quantity across two images -> conflict detected, REVIEW", async () => {
      const insp = await request(app)
        .post("/api/v1/inspections")
        .set("Authorization", `Bearer ${token}`)
        .send({ packageType: "RETAIL", intendedConsumer: "RETAIL" });
      const inspId = insp.body.data.id;

      // Image 1: Net Qty 250 g
      const img1Buf = await createSvgImage(`
        <svg width="900" height="500">
          <text x="50" y="150" font-size="30">Net Quantity: 250 g</text>
          <text x="50" y="220" font-size="30">MRP Rs. 30 (incl. of all taxes)</text>
          <text x="50" y="290" font-size="24">Manufactured by: ACME Ltd, 12 Park Street, Kolkata - 700016</text>
        </svg>
      `);
      // Image 2: Net Qty 400 g
      const img2Buf = await createSvgImage(`
        <svg width="900" height="500">
          <text x="50" y="150" font-size="30">Net Quantity: 400 g</text>
          <text x="50" y="220" font-size="24">Consumer Care: 1800-123-456</text>
          <text x="50" y="290" font-size="24">MFD: SEP 2026</text>
        </svg>
      `);

      await request(app).post(`/api/v1/inspections/${inspId}/images`).set("Authorization", `Bearer ${token}`).attach("images", img1Buf, "img1.jpg");
      await request(app).post(`/api/v1/inspections/${inspId}/images`).set("Authorization", `Bearer ${token}`).attach("images", img2Buf, "img2.jpg");

      await request(app).post(`/api/v1/inspections/${inspId}/analyze`).set("Authorization", `Bearer ${token}`);
      await request(app).post(`/api/v1/inspections/${inspId}/declarations/extract`).set("Authorization", `Bearer ${token}`);

      const compRes = await request(app).post(`/api/v1/inspections/${inspId}/compliance`).set("Authorization", `Bearer ${token}`);
      const r61c = compRes.body.data.results.find((r: any) => r.ruleId === "R6.1c");
      expect(r61c.status).toBe("REVIEW");
      expect(r61c.reason).toMatch(/conflicting.*net quantity/i);
    }, 60000);

    it("8. Existing single-image inspections -> behavior unchanged", async () => {
      const insp = await request(app)
        .post("/api/v1/inspections")
        .set("Authorization", `Bearer ${token}`)
        .send({ packageType: "RETAIL", intendedConsumer: "RETAIL" });
      const inspId = insp.body.data.id;

      const singleBuf = await createSvgImage(`
        <svg width="900" height="500">
          <text x="50" y="100" font-size="30">Net Quantity: 250 g</text>
          <text x="50" y="160" font-size="30">MRP Rs. 30 (incl. of all taxes)</text>
          <text x="50" y="220" font-size="24">Manufactured by: ACME Ltd, 12 Park Street, Kolkata - 700016</text>
          <text x="50" y="280" font-size="24">Consumer Care: 1800-123-456</text>
          <text x="50" y="340" font-size="24">MFD: SEP 2026</text>
        </svg>
      `);

      await request(app).post(`/api/v1/inspections/${inspId}/images`).set("Authorization", `Bearer ${token}`).attach("images", singleBuf, "single.jpg");
      await request(app).post(`/api/v1/inspections/${inspId}/analyze`).set("Authorization", `Bearer ${token}`);
      const extRes = await request(app).post(`/api/v1/inspections/${inspId}/declarations/extract`).set("Authorization", `Bearer ${token}`);

      for (const d of extRes.body.data.declarations) {
        expect(d.conflicts).toBeFalsy();
      }

      const compRes = await request(app).post(`/api/v1/inspections/${inspId}/compliance`).set("Authorization", `Bearer ${token}`);
      expect(compRes.body.data.results.some((r: any) => r.ruleId === "R6.1c" && r.status === "PASS")).toBe(true);
      expect(compRes.body.data.results.some((r: any) => r.ruleId === "R6.1e" && r.status === "PASS")).toBe(true);
    }, 60000);

    it("10. Package-level rule execution still happens exactly once per inspection/package", async () => {
      const insp = await request(app)
        .post("/api/v1/inspections")
        .set("Authorization", `Bearer ${token}`)
        .send({ packageType: "RETAIL", intendedConsumer: "RETAIL" });
      const inspId = insp.body.data.id;

      const img1 = await createSvgImage('<svg width="900" height="500"><text x="50" y="150" font-size="30">Net Quantity: 250 g</text></svg>');
      const img2 = await createSvgImage('<svg width="900" height="500"><text x="50" y="150" font-size="30">MRP Rs. 30 (incl. of all taxes)</text></svg>');
      const img3 = await createSvgImage('<svg width="900" height="500"><text x="50" y="150" font-size="24">MFD: SEP 2026</text></svg>');

      await request(app).post(`/api/v1/inspections/${inspId}/images`).set("Authorization", `Bearer ${token}`).attach("images", img1, "1.jpg");
      await request(app).post(`/api/v1/inspections/${inspId}/images`).set("Authorization", `Bearer ${token}`).attach("images", img2, "2.jpg");
      await request(app).post(`/api/v1/inspections/${inspId}/images`).set("Authorization", `Bearer ${token}`).attach("images", img3, "3.jpg");

      await request(app).post(`/api/v1/inspections/${inspId}/analyze`).set("Authorization", `Bearer ${token}`);
      await request(app).post(`/api/v1/inspections/${inspId}/declarations/extract`).set("Authorization", `Bearer ${token}`);

      const compRes = await request(app).post(`/api/v1/inspections/${inspId}/compliance`).set("Authorization", `Bearer ${token}`);

      // Count occurrences of rule R6.1c in the compliance output
      const r61cResults = compRes.body.data.results.filter((r: any) => r.ruleId === "R6.1c");
      expect(r61cResults).toHaveLength(1); // Executed exactly once, not 3 times!

      const r61eResults = compRes.body.data.results.filter((r: any) => r.ruleId === "R6.1e");
      expect(r61eResults).toHaveLength(1); // Executed exactly once
    }, 60000);
  });
});
