import { z } from "zod";

export const historyQuerySchema = z.object({
  q: z.string().max(100).optional(), // search text
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  status: z.enum(["DRAFT", "PROCESSING", "COMPLETED", "UNDER_REVIEW", "CLOSED"]).optional(),
  productCategory: z.string().max(50).optional(),
  inspectorId: z.string().uuid().optional(),
  violationRuleId: z.string().max(20).optional(),
  sortBy: z.enum(["createdAt", "inspectionDate", "inspectionNumber", "status"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type HistoryQuery = z.infer<typeof historyQuerySchema>;
