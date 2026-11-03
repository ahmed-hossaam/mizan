import { Router, type IRouter } from "express";
import { and, eq, gte, lte, sum } from "drizzle-orm";
import {
  CreateBudgetBody,
  CreateBudgetResponse,
  DeleteBudgetParams,
  ListBudgetsQueryParams,
  ListBudgetsResponse,
  UpdateBudgetBody,
  UpdateBudgetParams,
  UpdateBudgetResponse,
} from "@workspace/api-zod";
import { db, budgetsTable, categoriesTable, transactionsTable } from "@workspace/db";
import { getRequestUserId } from "../middlewares/requireAuth";
import {
  amountAsNumber,
  getMonthBounds,
  getMonthDate,
  ownsCategory,
} from "../lib/finance";

const router: IRouter = Router();

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "23505"
  );
}

async function spentByCategory(
  userId: string,
  month: string,
): Promise<Map<string, number>> {
  const { start, end } = getMonthBounds(month);
  const rows = await db
    .select({
      categoryId: transactionsTable.categoryId,
      amount: sum(transactionsTable.amount),
    })
    .from(transactionsTable)
    .where(
      and(
        eq(transactionsTable.userId, userId),
        eq(transactionsTable.type, "expense"),
        gte(transactionsTable.date, start),
        lte(transactionsTable.date, end),
      ),
    )
    .groupBy(transactionsTable.categoryId);
  return new Map(
    rows
      .filter((row): row is { categoryId: string; amount: string | null } => row.categoryId !== null)
      .map((row) => [row.categoryId, amountAsNumber(row.amount)]),
  );
}

function budgetDto(
  budget: {
    id: string;
    categoryId: string;
    categoryName: string;
    categoryColor: string;
    month: string;
    limitAmount: number | string | bigint;
  },
  spent: number,
) {
  const limitAmount = amountAsNumber(budget.limitAmount);
  return {
    ...budget,
    month: budget.month.slice(0, 7),
    limitAmount,
    spent,
    remaining: limitAmount - spent,
    percentage: (spent / limitAmount) * 100,
  };
}

async function findBudget(userId: string, id: string) {
  const [budget] = await db
    .select({
      id: budgetsTable.id,
      categoryId: budgetsTable.categoryId,
      categoryName: categoriesTable.name,
      categoryColor: categoriesTable.color,
      month: budgetsTable.month,
      limitAmount: budgetsTable.limitAmount,
    })
    .from(budgetsTable)
    .innerJoin(categoriesTable, eq(budgetsTable.categoryId, categoriesTable.id))
    .where(and(eq(budgetsTable.id, id), eq(budgetsTable.userId, userId)))
    .limit(1);
  if (!budget) return undefined;
  const spent = (await spentByCategory(userId, budget.month.slice(0, 7))).get(
    budget.categoryId,
  ) ?? 0;
  return budgetDto(budget, spent);
}

router.route("/budgets").get(async (req, res): Promise<void> => {
  const parsed = ListBudgetsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const month = parsed.data.month ?? new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
  })
    .format(new Date())
    .slice(0, 7);
  let monthDate: string;
  try {
    monthDate = getMonthDate(month);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Invalid month." });
    return;
  }
  const userId = getRequestUserId(res);
  const [budgets, spending] = await Promise.all([
    db
      .select({
        id: budgetsTable.id,
        categoryId: budgetsTable.categoryId,
        categoryName: categoriesTable.name,
        categoryColor: categoriesTable.color,
        month: budgetsTable.month,
        limitAmount: budgetsTable.limitAmount,
      })
      .from(budgetsTable)
      .innerJoin(categoriesTable, eq(budgetsTable.categoryId, categoriesTable.id))
      .where(
        and(
          eq(budgetsTable.userId, userId),
          eq(budgetsTable.month, monthDate),
        ),
      )
      .orderBy(categoriesTable.name),
    spentByCategory(userId, month),
  ]);
  res.json(
    ListBudgetsResponse.parse(
      budgets.map((budget) =>
        budgetDto(budget, spending.get(budget.categoryId) ?? 0),
      ),
    ),
  );
});

router.route("/budgets").post(async (req, res): Promise<void> => {
  const parsed = CreateBudgetBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (!Number.isSafeInteger(parsed.data.limitAmount)) {
    res.status(400).json({ error: "Budget limit is outside the supported range." });
    return;
  }
  const userId = getRequestUserId(res);
  if (!(await ownsCategory(userId, parsed.data.categoryId))) {
    res.status(400).json({ error: "Choose a category owned by your account." });
    return;
  }
  let monthDate: string;
  try {
    monthDate = getMonthDate(parsed.data.month);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Invalid month." });
    return;
  }
  try {
    const [created] = await db
      .insert(budgetsTable)
      .values({
        userId,
        categoryId: parsed.data.categoryId,
        month: monthDate,
        limitAmount: parsed.data.limitAmount,
      })
      .returning({ id: budgetsTable.id });
    res.status(201).json(
      CreateBudgetResponse.parse(await findBudget(userId, created.id)),
    );
  } catch (error) {
    if (isUniqueViolation(error)) {
      res.status(409).json({ error: "A budget already exists for this category and month." });
      return;
    }
    throw error;
  }
});

router.route("/budgets/:id").patch(async (req, res): Promise<void> => {
  const params = UpdateBudgetParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateBudgetBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (!Number.isSafeInteger(parsed.data.limitAmount)) {
    res.status(400).json({ error: "Budget limit is outside the supported range." });
    return;
  }
  const userId = getRequestUserId(res);
  const [updated] = await db
    .update(budgetsTable)
    .set({ limitAmount: parsed.data.limitAmount })
    .where(
      and(
        eq(budgetsTable.id, params.data.id),
        eq(budgetsTable.userId, userId),
      ),
    )
    .returning({ id: budgetsTable.id });
  if (!updated) {
    res.status(404).json({ error: "Budget not found." });
    return;
  }
  res.json(
    UpdateBudgetResponse.parse(await findBudget(userId, updated.id)),
  );
});

router.route("/budgets/:id").delete(async (req, res): Promise<void> => {
  const params = DeleteBudgetParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [deleted] = await db
    .delete(budgetsTable)
    .where(
      and(
        eq(budgetsTable.id, params.data.id),
        eq(budgetsTable.userId, getRequestUserId(res)),
      ),
    )
    .returning({ id: budgetsTable.id });
  if (!deleted) {
    res.status(404).json({ error: "Budget not found." });
    return;
  }
  res.sendStatus(204);
});

export default router;
