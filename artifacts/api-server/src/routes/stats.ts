import { Router, type IRouter } from "express";
import {
  and,
  count,
  desc,
  eq,
  gte,
  lte,
  sql,
  sum,
} from "drizzle-orm";
import {
  GetMonthlyStatsQueryParams,
  GetMonthlyStatsResponse,
  GetMonthlyTrendsResponse,
} from "@workspace/api-zod";
import { db, categoriesTable, transactionsTable } from "@workspace/db";
import { getRequestUserId } from "../middlewares/requireAuth";
import {
  amountAsNumber,
  cairoCurrentMonth,
  getMonthBounds,
  getMonthDate,
} from "../lib/finance";

const router: IRouter = Router();

function lastSixMonths(): string[] {
  const [year, month] = cairoCurrentMonth().split("-").map(Number);
  return Array.from({ length: 6 }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 1 - (5 - index), 1));
    return date.toISOString().slice(0, 7);
  });
}

router.get("/stats/monthly", async (req, res): Promise<void> => {
  const parsed = GetMonthlyStatsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { month } = parsed.data;
  let bounds: { start: string; end: string };
  try {
    bounds = getMonthBounds(month);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Invalid month." });
    return;
  }
  const userId = getRequestUserId(res);
  const dateFilters = and(
    eq(transactionsTable.userId, userId),
    gte(transactionsTable.date, bounds.start),
    lte(transactionsTable.date, bounds.end),
  );
  const [totals, categoryRows, recentRows] = await Promise.all([
    db
      .select({
        type: transactionsTable.type,
        amount: sum(transactionsTable.amount),
        count: count(),
      })
      .from(transactionsTable)
      .where(dateFilters)
      .groupBy(transactionsTable.type),
    db
      .select({
        categoryId: transactionsTable.categoryId,
        name: categoriesTable.name,
        color: categoriesTable.color,
        amount: sum(transactionsTable.amount),
      })
      .from(transactionsTable)
      .leftJoin(categoriesTable, eq(transactionsTable.categoryId, categoriesTable.id))
      .where(
        and(
          dateFilters,
          eq(transactionsTable.type, "expense"),
        ),
      )
      .groupBy(
        transactionsTable.categoryId,
        categoriesTable.name,
        categoriesTable.color,
      )
      .orderBy(desc(sum(transactionsTable.amount))),
    db
      .select({
        id: transactionsTable.id,
        categoryId: transactionsTable.categoryId,
        categoryName: categoriesTable.name,
        categoryColor: categoriesTable.color,
        amount: transactionsTable.amount,
        type: transactionsTable.type,
        note: transactionsTable.note,
        date: transactionsTable.date,
        createdAt: transactionsTable.createdAt,
      })
      .from(transactionsTable)
      .leftJoin(categoriesTable, eq(transactionsTable.categoryId, categoriesTable.id))
      .where(dateFilters)
      .orderBy(desc(transactionsTable.date), desc(transactionsTable.createdAt))
      .limit(5),
  ]);
  const totalIncome = amountAsNumber(
    totals.find((row) => row.type === "income")?.amount ?? 0,
  );
  const totalExpenses = amountAsNumber(
    totals.find((row) => row.type === "expense")?.amount ?? 0,
  );
  const transactionCount = totals.reduce((total, row) => total + row.count, 0);
  const response = GetMonthlyStatsResponse.parse({
    month,
    totalIncome,
    totalExpenses,
    netBalance: totalIncome - totalExpenses,
    transactionCount,
    categoryBreakdown: categoryRows.map((row) => ({
      categoryId: row.categoryId,
      name: row.name ?? "Uncategorized",
      color: row.color ?? "#9CA3AF",
      amount: amountAsNumber(row.amount),
    })),
    recentTransactions: recentRows.map((row) => ({
      ...row,
      amount: amountAsNumber(row.amount),
    })),
  });
  res.json(response);
});

router.get("/stats/trends", async (_req, res): Promise<void> => {
  const months = lastSixMonths();
  const start = getMonthDate(months[0]);
  const end = getMonthBounds(months[months.length - 1]).end;
  const userId = getRequestUserId(res);
  const monthExpression = sql<string>`to_char(${transactionsTable.date}::date, 'YYYY-MM')`;
  const rows = await db
    .select({
      month: monthExpression,
      type: transactionsTable.type,
      amount: sum(transactionsTable.amount),
    })
    .from(transactionsTable)
    .where(
      and(
        eq(transactionsTable.userId, userId),
        gte(transactionsTable.date, start),
        lte(transactionsTable.date, end),
      ),
    )
    .groupBy(monthExpression, transactionsTable.type);
  const amounts = new Map<string, { income: number; expenses: number }>();
  for (const month of months) amounts.set(month, { income: 0, expenses: 0 });
  for (const row of rows) {
    const value = amounts.get(row.month);
    if (value) {
      value[row.type === "income" ? "income" : "expenses"] = amountAsNumber(row.amount);
    }
  }
  const result = months.map((month) => ({
    month,
    ...amounts.get(month)!,
  }));
  res.json(GetMonthlyTrendsResponse.parse(result));
});

export default router;
