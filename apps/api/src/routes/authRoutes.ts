import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { registerSchema, loginSchema } from "../validators/authSchemas.js";
import { registerController, loginController, meController, logoutController } from "../controllers/authController.js";
import { loginLimiter, registerLimiter } from "../middleware/rateLimit.js";

const router = Router();

router.post("/register", registerLimiter, validateBody(registerSchema), registerController);
router.post("/login", loginLimiter, validateBody(loginSchema), loginController);
router.post("/logout", requireAuth, logoutController);
router.get("/me", requireAuth, meController);

export default router;
