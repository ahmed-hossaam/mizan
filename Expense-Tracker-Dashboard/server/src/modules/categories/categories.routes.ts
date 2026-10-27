import { Router } from "express";
import { prisma } from "../../config/prisma.js";
import { asyncHandler, getUserId } from "../../middleware/auth.js";
import { HttpError, isUniqueViolation } from "../../utils/http.js";
import { categoryIdParams, createCategorySchema, updateCategorySchema } from "./categories.schema.js";

const router = Router();

function serializeCategory(category: { id: string; name: string; color: string; createdAt: Date }) {
  return {
    id: category.id,
    name: category.name,
    color: category.color,
    createdAt: category.createdAt.toISOString(),
  };
}

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const categories = await prisma.category.findMany({
      where: { userId: getUserId(req) },
      orderBy: { name: "asc" },
    });
    res.json(categories.map(serializeCategory));
  }),
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const data = createCategorySchema.parse(req.body);
    try {
      const category = await prisma.category.create({
        data: { ...data, userId: getUserId(req) },
      });
      res.status(201).json(serializeCategory(category));
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new HttpError(409, "A category with that name already exists.");
      }
      throw error;
    }
  }),
);

router.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const { id } = categoryIdParams.parse(req.params);
    const data = updateCategorySchema.parse(req.body);
    if (Object.keys(data).length === 0) {
      throw new HttpError(400, "Provide a category name or color to update.");
    }
    try {
      const category = await prisma.category.updateMany({
        where: { id, userId: getUserId(req) },
        data,
      });
      if (category.count === 0) {
        throw new HttpError(404, "Category not found.");
      }
      const updated = await prisma.category.findFirst({
        where: { id, userId: getUserId(req) },
      });
      res.json(serializeCategory(updated!));
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new HttpError(409, "A category with that name already exists.");
      }
      throw error;
    }
  }),
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const { id } = categoryIdParams.parse(req.params);
    const userId = getUserId(req);
    const category = await prisma.category.findFirst({ where: { id, userId } });
    if (!category) {
      throw new HttpError(404, "Category not found.");
    }
    const [transactionCount, budgetCount] = await Promise.all([
      prisma.transaction.count({ where: { userId, categoryId: id } }),
      prisma.budget.count({ where: { userId, categoryId: id } }),
    ]);
    if (transactionCount > 0 || budgetCount > 0) {
      throw new HttpError(
        409,
        "This category is in use. Move its transactions and budgets before deleting it.",
      );
    }
    await prisma.category.delete({ where: { id } });
    res.status(204).send();
  }),
);

export default router;
