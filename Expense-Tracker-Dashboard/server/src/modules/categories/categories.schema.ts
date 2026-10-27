import { z } from "zod";
import { COLOR_PATTERN } from "../../utils/categories.js";

export const categoryIdParams = z.object({
  id: z.string().uuid(),
});

export const createCategorySchema = z.object({
  name: z.string().trim().min(1, "Category name is required.").max(50),
  color: z.string().regex(COLOR_PATTERN, "Color must be a hex value such as #438d6a."),
});

export const updateCategorySchema = createCategorySchema.partial();
