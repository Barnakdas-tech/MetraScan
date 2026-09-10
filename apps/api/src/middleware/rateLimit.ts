import rateLimit from "express-rate-limit";

import type { Request, Response } from "express";
import { env } from "../config/env.js";

function keyGenerator(req: Request, _res: Response): string {
  const ip = req.ip ?? "unknown";
  return (req.user?.sub ?? "anon") + ":" + ip;
}

/** In the test environment the suite makes hundreds of login/register calls
 *  from a single IP; limiting there would only test the limiter. Production
 *  and development keep the full limits. */
const skipInTest = env.NODE_ENV === "test" ? () => true : undefined;

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  keyGenerator,
  skip: skipInTest,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { success: false, error: { code: "RATE_LIMITED", message: "Too many attempts. Try again later." } },
});

export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  keyGenerator,
  skip: skipInTest,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { success: false, error: { code: "RATE_LIMITED", message: "Too many attempts. Try again later." } },
});

export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  keyGenerator,
  skip: skipInTest,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { success: false, error: { code: "RATE_LIMITED", message: "Too many requests. Try again shortly." } },
});
