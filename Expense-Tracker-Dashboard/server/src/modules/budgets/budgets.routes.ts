import { Router } from "express";
import { prisma } from "../../config/prisma.js";
import { asyncHandler, getUserId } from "../../middleware/auth.js";
import { cairoCurrentMonth, formatDateOnly, getMonthBounds, getMonthDate } from "../../utils/dates.js";
import { HttpError, isUniqueViolation } from "../../utils/http.js";
import { assertSafeAmount, toMinorNumber } from "../../utils/money.js";
import {
  budgetIdParams,
  createBudgetSchema,
  listBudgetsQuery,
  updateBudgetSchema,
} from "./budgets.schema.js";

const router = Router();

async function spentByCategory(userId: string, month: string): Promise<Map<string, number>> {
  const { start, end } = getMonthBounds(month);
  const rows = await prisma.transaction.groupBy({
    by: ["categoryId"],
    where: {
      userId,
      type: "expense",
      date: { gte: start, lte: end },
      categoryId: { not: null },
    },
    _sum: { amount: true },
  });
  return new Map(
    rows
      .filter((row) => row.categoryId)
      .map((row) => [row.categoryId as string, toMinorNumber(row._sum.amount ?? 0n)]),
  );
}

function budgetDto(
  budget: {
    id: string;
    categoryId: string;
    month: Date;
    limitAmount: bigint;
    category: { name: string; color: string };
  },
  spent: number,
) {
  const limitAmount = toMinorNumber(budget.limitAmount);
  return {
    id: budget.id,
    categoryId: budget.categoryId,
    categoryName: budget.category.name,
    categoryColor: budget.category.color,
    month: formatDateOnly(budget.month).slice(0, 7),
    limitAmount,
    spent,
    remaining: limitAmount - spent,
    percentage: limitAmount === 0 ? 0 : (spent / limitAmount) * 100,
  };
}

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { month = cairoCurrentMonth() } = listBudgetsQuery.parse(req.query);
    const monthDate = getMonthDate(month);
    const userId = getUserId(req);
    const [budgets, spending] = await Promise.all([
      prisma.budget.findMany({
        where: { userId, month: monthDate },
        include: { category: { select: { name: true, color: true } } },
        orderBy: { category: { name: "asc" } },
      }),
      spentByCategory(userId, month),
    ]);
    res.json(budgets.map((budget) => budgetDto(budget, spending.get(budget.categoryId) ?? 0)));
  }),
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const data = createBudgetSchema.parse(req.body);
    assertSafeAmount(data.limitAmount, "Budget limit");
    const userId = getUserId(req);
    const category = await prisma.category.findFirst({
      where: { id: data.categoryId, userId },
    });
    if (!category) {
      throw new HttpError(400, "Choose a category owned by your account.");
    }
    try {
      const created = await prisma.budget.create({
        data: {
          userId,
          categoryId: data.categoryId,
          month: getMonthDate(data.month),
          limitAmount: BigInt(data.limitAmount),
        },
        include: { category: { select: { name: true, color: true } } },
      });
      const spending = await spentByCategory(userId, data.month);
      res.status(201).json(budgetDto(created, spending.get(created.categoryId) ?? 0));
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new HttpError(409, "A budget already exists for this category and month.");
      }
      throw error;
    }
  }),
);

router.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const { id } = budgetIdParams.parse(req.params);
    const data = updateBudgetSchema.parse(req.body);
    assertSafeAmount(data.limitAmount, "Budget limit");
    const userId = getUserId(req);
    const existing = await prisma.budget.findFirst({
      where: { id, userId },
      include: { category: { select: { name: true, color: true } } },
    });
    if (!existing) {
      throw new HttpError(404, "Budget not found.");
    }
    const updated = await prisma.budget.update({
      where: { id },
      data: { limitAmount: BigInt(data.limitAmount) },
      include: { category: { select: { name: true, color: true } } },
    });
    const spending = await spentByCategory(userId, formatDateOnly(updated.month).slice(0, 7));
    res.json(budgetDto(updated, spending.get(updated.categoryId) ?? 0));
  }),
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const { id } = budgetIdParams.parse(req.params);
    const deleted = await prisma.budget.deleteMany({
      where: { id, userId: getUserId(req) },
    });
    if (deleted.count === 0) {
      throw new HttpError(404, "Budget not found.");
    }
    res.status(204).send();
  }),
);

export default router;
