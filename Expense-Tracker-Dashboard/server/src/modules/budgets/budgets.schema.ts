import { z } from "zod";

export const budgetIdParams = z.object({
  id: z.string().uuid(),
});

export const listBudgetsQuery = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
});

export const createBudgetSchema = z.object({
  categoryId: z.string().uuid(),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Month must use YYYY-MM format."),
  limitAmount: z.number().int().positive("Budget limit must be a positive number of piastres."),
});

export const updateBudgetSchema = z.object({
  limitAmount: z.number().int().positive("Budget limit must be a positive number of piastres."),
});
