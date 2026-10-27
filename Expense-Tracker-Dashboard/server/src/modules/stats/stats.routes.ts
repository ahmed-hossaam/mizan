import { Router } from "express";
import { prisma } from "../../config/prisma.js";
import { asyncHandler, getUserId } from "../../middleware/auth.js";
import { formatDateOnly, getMonthBounds, getMonthDate, lastSixMonths } from "../../utils/dates.js";
import { toMinorNumber } from "../../utils/money.js";
import { monthlyStatsQuery } from "./stats.schema.js";

const router = Router();

router.get(
  "/monthly",
  asyncHandler(async (req, res) => {
    const { month } = monthlyStatsQuery.parse(req.query);
    const { start, end } = getMonthBounds(month);
    const userId = getUserId(req);
    const dateFilter = { userId, date: { gte: start, lte: end } };
    const [totals, categoryRows, recentRows] = await Promise.all([
      prisma.transaction.groupBy({
        by: ["type"],
        where: dateFilter,
        _sum: { amount: true },
        _count: { _all: true },
      }),
      prisma.transaction.groupBy({
        by: ["categoryId"],
        where: { ...dateFilter, type: "expense" },
        _sum: { amount: true },
        orderBy: { _sum: { amount: "desc" } },
      }),
      prisma.transaction.findMany({
        where: dateFilter,
        include: { category: { select: { name: true, color: true } } },
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
        take: 5,
      }),
    ]);
    const categoryIds = categoryRows.map((row) => row.categoryId).filter((id): id is string => Boolean(id));
    const categories = categoryIds.length
      ? await prisma.category.findMany({
          where: { userId, id: { in: categoryIds } },
          select: { id: true, name: true, color: true },
        })
      : [];
    const categoryMap = new Map(categories.map((category) => [category.id, category]));
    const totalIncome = toMinorNumber(totals.find((row) => row.type === "income")?._sum.amount ?? 0n);
    const totalExpenses = toMinorNumber(totals.find((row) => row.type === "expense")?._sum.amount ?? 0n);
    res.json({
      month,
      totalIncome,
      totalExpenses,
      netBalance: totalIncome - totalExpenses,
      transactionCount: totals.reduce((sum, row) => sum + row._count._all, 0),
      categoryBreakdown: categoryRows.map((row) => {
        const category = row.categoryId ? categoryMap.get(row.categoryId) : undefined;
        return {
          categoryId: row.categoryId,
          name: category?.name ?? "Uncategorized",
          color: category?.color ?? "#9CA3AF",
          amount: toMinorNumber(row._sum.amount ?? 0n),
        };
      }),
      recentTransactions: recentRows.map((row) => ({
        id: row.id,
        categoryId: row.categoryId,
        categoryName: row.category?.name ?? null,
        categoryColor: row.category?.color ?? null,
        amount: toMinorNumber(row.amount),
        type: row.type,
        note: row.note,
        date: formatDateOnly(row.date),
        createdAt: row.createdAt.toISOString(),
      })),
    });
  }),
);

router.get(
  "/trends",
  asyncHandler(async (req, res) => {
    const months = lastSixMonths();
    const start = getMonthDate(months[0]);
    const end = getMonthBounds(months[months.length - 1]).end;
    const userId = getUserId(req);
    const rows = await prisma.$queryRaw<Array<{ month: string; type: "income" | "expense"; amount: bigint }>>`
      SELECT to_char(date, 'YYYY-MM') AS month, type, SUM(amount)::bigint AS amount
      FROM transactions
      WHERE user_id = ${userId}::uuid
        AND date >= ${start}
        AND date <= ${end}
      GROUP BY 1, 2
    `;
    const amounts = new Map(months.map((month) => [month, { income: 0, expenses: 0 }]));
    for (const row of rows) {
      const value = amounts.get(row.month);
      if (value) {
        value[row.type === "income" ? "income" : "expenses"] = toMinorNumber(row.amount);
      }
    }
    res.json(months.map((month) => ({ month, ...amounts.get(month)! })));
  }),
);

export default router;
