import { Router } from "express";

const router = Router();

router.get("/", (_req, res) => {
  res.json({ success: true, data: { status: "ok", service: "metrascan-api", time: new Date().toISOString() } });
});

export default router;
