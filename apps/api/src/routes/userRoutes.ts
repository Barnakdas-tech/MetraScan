import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/rbac.js";
import { validateBody } from "../middleware/validate.js";
import {
  updateProfileSchema,
  updatePasswordSchema,
  createUserSchema,
  updateRoleSchema,
  updateStatusSchema,
} from "../validators/userSchemas.js";
import {
  updateProfileController,
  updatePasswordController,
  listUsersController,
  createUserController,
  updateUserRoleController,
  updateUserStatusController,
} from "../controllers/userController.js";
import { meController } from "../controllers/authController.js";

const router = Router();
router.use(requireAuth);

router.get("/me", meController);
router.patch("/me", validateBody(updateProfileSchema), updateProfileController);
router.post("/me/password", validateBody(updatePasswordSchema), updatePasswordController);

// Admin-only user management
router.get("/", requireRole("ADMIN"), listUsersController);
router.post("/", requireRole("ADMIN"), validateBody(createUserSchema), createUserController);
router.patch("/:id/role", requireRole("ADMIN"), validateBody(updateRoleSchema), updateUserRoleController);
router.patch("/:id/status", requireRole("ADMIN"), validateBody(updateStatusSchema), updateUserStatusController);

export default router;

