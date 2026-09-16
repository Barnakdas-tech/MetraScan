import { z } from "zod";

export const updateProfileSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  email: z.string().email().max(255).transform(v => v.toLowerCase().trim()).optional(),
});

export const updatePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z
    .string()
    .min(10, "Password must be at least 10 characters")
    .max(72)
    .refine(v => /[a-z]/.test(v) && /[A-Z]/.test(v) && /[0-9]/.test(v), {
      message: "Password must mix upper-case, lower-case, and digits",
    }),
});

export const createUserSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email().max(255).transform(v => v.toLowerCase().trim()),
  password: z
    .string()
    .min(10, "Password must be at least 10 characters")
    .max(72)
    .refine(v => /[a-z]/.test(v) && /[A-Z]/.test(v) && /[0-9]/.test(v), {
      message: "Password must mix upper-case, lower-case, and digits",
    }),
  role: z.enum(["ADMIN", "INSPECTOR", "REVIEWER", "VIEWER"]),
});

export const updateRoleSchema = z.object({
  role: z.enum(["ADMIN", "INSPECTOR", "REVIEWER", "VIEWER"]),
});

export const updateStatusSchema = z.object({
  isActive: z.boolean(),
});

