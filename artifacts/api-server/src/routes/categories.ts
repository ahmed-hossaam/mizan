import { Router, type IRouter } from "express";
import { and, asc, count, eq } from "drizzle-orm";
import {
  CreateCategoryBody,
  CreateCategoryResponse,
  DeleteCategoryParams,
  ListCategoriesResponse,
  UpdateCategoryBody,
  UpdateCategoryParams,
  UpdateCategoryResponse,
} from "@workspace/api-zod";
import {
  db,
  budgetsTable,
  categoriesTable,
  transactionsTable,
} from "@workspace/db";
import { getRequestUserId } from "../middlewares/requireAuth";
import { ensureDefaultCategories, isUniqueViolation } from "../lib/finance";

const router: IRouter = Router();

router.get("/categories", async (_req, res): Promise<void> => {
  const userId = getRequestUserId(res);
  await ensureDefaultCategories(userId);
  const categories = await db
    .select({
      id: categoriesTable.id,
      name: categoriesTable.name,
      color: categoriesTable.color,
      createdAt: categoriesTable.createdAt,
    })
    .from(categoriesTable)
    .where(eq(categoriesTable.userId, userId))
    .orderBy(asc(categoriesTable.name));
  res.json(ListCategoriesResponse.parse(categories));
});

router.post("/categories", async (req, res): Promise<void> => {
  const parsed = CreateCategoryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const name = parsed.data.name.trim();
  if (!name) {
    res.status(400).json({ error: "Category name cannot be blank." });
    return;
  }
  try {
    const [category] = await db
      .insert(categoriesTable)
      .values({
        userId: getRequestUserId(res),
        name,
        color: parsed.data.color,
      })
      .returning({
        id: categoriesTable.id,
        name: categoriesTable.name,
        color: categoriesTable.color,
        createdAt: categoriesTable.createdAt,
      });
    res.status(201).json(CreateCategoryResponse.parse(category));
  } catch (error) {
    if (isUniqueViolation(error)) {
      res.status(409).json({ error: "A category with that name already exists." });
      return;
    }
    throw error;
  }
});

router.patch("/categories/:id", async (req, res): Promise<void> => {
  const params = UpdateCategoryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateCategoryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (Object.keys(parsed.data).length === 0) {
    res.status(400).json({ error: "Provide a category name or color to update." });
    return;
  }
  const name = parsed.data.name?.trim();
  if (parsed.data.name !== undefined && !name) {
    res.status(400).json({ error: "Category name cannot be blank." });
    return;
  }
  try {
    const [category] = await db
      .update(categoriesTable)
      .set({
        ...(name !== undefined ? { name } : {}),
        ...(parsed.data.color !== undefined ? { color: parsed.data.color } : {}),
      })
      .where(
        and(
          eq(categoriesTable.id, params.data.id),
          eq(categoriesTable.userId, getRequestUserId(res)),
        ),
      )
      .returning({
        id: categoriesTable.id,
        name: categoriesTable.name,
        color: categoriesTable.color,
        createdAt: categoriesTable.createdAt,
      });
    if (!category) {
      res.status(404).json({ error: "Category not found." });
      return;
    }
    res.json(UpdateCategoryResponse.parse(category));
  } catch (error) {
    if (isUniqueViolation(error)) {
      res.status(409).json({ error: "A category with that name already exists." });
      return;
    }
    throw error;
  }
});

router.delete("/categories/:id", async (req, res): Promise<void> => {
  const params = DeleteCategoryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const userId = getRequestUserId(res);
  const [category] = await db
    .select({ id: categoriesTable.id })
    .from(categoriesTable)
    .where(and(eq(categoriesTable.id, params.data.id), eq(categoriesTable.userId, userId)))
    .limit(1);
  if (!category) {
    res.status(404).json({ error: "Category not found." });
    return;
  }
  const [transactions, budgets] = await Promise.all([
    db
      .select({ value: count() })
      .from(transactionsTable)
      .where(
        and(
          eq(transactionsTable.userId, userId),
          eq(transactionsTable.categoryId, params.data.id),
        ),
      ),
    db
      .select({ value: count() })
      .from(budgetsTable)
      .where(
        and(
          eq(budgetsTable.userId, userId),
          eq(budgetsTable.categoryId, params.data.id),
        ),
      ),
  ]);
  if (transactions[0].value > 0 || budgets[0].value > 0) {
    res.status(409).json({
      error: "This category is in use. Move its transactions and budgets before deleting it.",
    });
    return;
  }
  const [deleted] = await db
    .delete(categoriesTable)
    .where(
      and(eq(categoriesTable.id, params.data.id), eq(categoriesTable.userId, userId)),
    )
    .returning({ id: categoriesTable.id });
  if (!deleted) {
    res.status(404).json({ error: "Category not found." });
    return;
  }
  res.sendStatus(204);
});

export default router;
