import { Router } from "express";
const router = Router();
router.get("/", (_req,res) => res.json({service:"metrascan-server",status:"ok"}));
export default router;
