import { PrismaClient } from "../generated/prisma/index.js";

export const prisma = new PrismaClient();

// Single shared instance; avoids exhausting connections in dev watch mode.
