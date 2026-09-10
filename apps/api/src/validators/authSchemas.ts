import { z } from "zod";

export const registerSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email().max(255).transform(v => v.toLowerCase().trim()),
  password: z
    .string()
    .min(10, "Password must be at least 10 characters")
    .max(72)
    .refine(v => /[a-z]/.test(v) && /[A-Z]/.test(v) && /[0-9]/.test(v), {
      message: "Password must mix upper-case, lower-case, and digits",
    }),
});

export const loginSchema = z.object({
  email: z.string().email().transform(v => v.toLowerCase().trim()),
  password: z.string().min(1),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
