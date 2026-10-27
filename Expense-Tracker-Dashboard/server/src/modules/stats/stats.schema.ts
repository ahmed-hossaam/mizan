import { z } from "zod";
import { cairoCurrentMonth } from "../../utils/dates.js";

export const monthlyStatsQuery = z.object({
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .optional()
    .transform((value) => value ?? cairoCurrentMonth()),
});
