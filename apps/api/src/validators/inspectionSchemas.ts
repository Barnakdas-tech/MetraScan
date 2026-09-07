import { z } from "zod";

export const createInspectionSchema = z.object({
  packageType: z.enum(["RETAIL", "WHOLESALE", "IMPORTED", "UNKNOWN"]).default("UNKNOWN"),
  intendedConsumer: z.enum(["RETAIL", "INDUSTRIAL", "INSTITUTIONAL", "UNKNOWN"]).default("UNKNOWN"),
  inspectionDate: z.coerce.date().optional(),
  location: z.string().max(255).optional(),
  notes: z.string().max(2000).optional(),
  product: z
    .object({
      name: z.string().min(1).max(200),
      genericName: z.string().max(200).optional(),
      brand: z.string().max(200).optional(),
      manufacturer: z.string().max(200).optional(),
      category: z.string().max(100).optional(),
    })
    .optional(),
});

export type CreateInspectionInput = z.infer<typeof createInspectionSchema>;
