import { createInsertSchema } from "drizzle-zod";
import { foreignKey, index, pgTable, text, timestamp, uniqueIndex, uuid, bigint, date } from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { categoriesTable } from "./categories";

export const budgetsTable = pgTable(
  "expense_budgets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id").notNull(),
    categoryId: uuid("category_id").notNull(),
    month: date("month", { mode: "string" }).notNull(),
    limitAmount: bigint("limit_amount", { mode: "number" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    foreignKey({
      columns: [table.categoryId],
      foreignColumns: [categoriesTable.id],
      name: "expense_budgets_category_fk",
    }).onDelete("restrict"),
    uniqueIndex("expense_budgets_user_category_month_unique").on(
      table.userId,
      table.categoryId,
      table.month,
    ),
    index("expense_budgets_user_month_idx").on(table.userId, table.month),
  ],
);

export const insertBudgetSchema = createInsertSchema(budgetsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertBudget = z.infer<typeof insertBudgetSchema>;
export type Budget = typeof budgetsTable.$inferSelect;
