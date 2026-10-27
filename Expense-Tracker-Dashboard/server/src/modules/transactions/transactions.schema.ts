import { z } from "zod";

export const transactionTypeSchema = z.enum(["income", "expense"]);

export const transactionIdParams = z.object({
  id: z.string().uuid(),
});

export const createTransactionSchema = z.object({
  type: transactionTypeSchema,
  amount: z.number().int().positive("Amount must be a positive number of piastres."),
  categoryId: z.string().uuid().nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must use YYYY-MM-DD format."),
});

export const updateTransactionSchema = createTransactionSchema.partial();

export const listTransactionsQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  search: z.string().trim().max(100).optional(),
  type: transactionTypeSchema.optional(),
  categoryId: z.string().uuid().optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  sortBy: z.enum(["date", "amount"]).default("date"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export const exportTransactionsQuery = listTransactionsQuery.pick({
  search: true,
  type: true,
  categoryId: true,
  startDate: true,
  endDate: true,
});
