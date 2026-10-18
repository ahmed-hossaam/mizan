import { createInsertSchema } from "drizzle-zod";
import { relations } from "drizzle-orm";
import {
  bigint,
  date,
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { categoriesTable } from "./categories";

export const transactionsTable = pgTable(
  "expense_transactions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id").notNull(),
    categoryId: uuid("category_id"),
    amount: bigint("amount", { mode: "number" }).notNull(),
    type: varchar("type", { length: 7, enum: ["income", "expense"] }).notNull(),
    note: text("note"),
    date: date("transaction_date", { mode: "string" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    foreignKey({
      columns: [table.categoryId],
      foreignColumns: [categoriesTable.id],
      name: "expense_transactions_category_fk",
    }).onDelete("restrict"),
    index("expense_transactions_user_date_idx").on(table.userId, table.date),
    index("expense_transactions_user_category_idx").on(table.userId, table.categoryId),
    index("expense_transactions_user_type_idx").on(table.userId, table.type),
  ],
);

export const transactionsRelations = relations(transactionsTable, ({ one }) => ({
  category: one(categoriesTable, {
    fields: [transactionsTable.categoryId],
    references: [categoriesTable.id],
  }),
}));

export const insertTransactionSchema = createInsertSchema(transactionsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;
export type Transaction = typeof transactionsTable.$inferSelect;
