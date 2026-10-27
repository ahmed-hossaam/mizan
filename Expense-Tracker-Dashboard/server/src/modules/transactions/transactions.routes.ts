import { Prisma } from "@prisma/client";
import { Router } from "express";
import { prisma } from "../../config/prisma.js";
import { asyncHandler, getUserId } from "../../middleware/auth.js";
import { formatDateOnly, parseDateOnly } from "../../utils/dates.js";
import { HttpError } from "../../utils/http.js";
import { amountAsDecimal, assertSafeAmount, toMinorNumber } from "../../utils/money.js";
import { toCsv } from "../../utils/csv.js";
import {
  createTransactionSchema,
  exportTransactionsQuery,
  listTransactionsQuery,
  transactionIdParams,
  updateTransactionSchema,
} from "./transactions.schema.js";

const router = Router();

async function ownsCategory(userId: string, categoryId: string | null | undefined): Promise<boolean> {
  if (categoryId == null) return true;
  const category = await prisma.category.findFirst({
    where: { id: categoryId, userId },
    select: { id: true },
  });
  return Boolean(category);
}

function serializeTransaction(row: {
  id: string;
  categoryId: string | null;
  category: { name: string; color: string } | null;
  amount: bigint;
  type: "income" | "expense";
  note: string | null;
  date: Date;
  createdAt: Date;
}) {
  return {
    id: row.id,
    categoryId: row.categoryId,
    categoryName: row.category?.name ?? null,
    categoryColor: row.category?.color ?? null,
    amount: toMinorNumber(row.amount),
    type: row.type,
    note: row.note,
    date: formatDateOnly(row.date),
    createdAt: row.createdAt.toISOString(),
  };
}

function buildWhere(
  userId: string,
  filters: {
    search?: string;
    type?: "income" | "expense";
    categoryId?: string;
    startDate?: string;
    endDate?: string;
  },
): Prisma.TransactionWhereInput {
  const where: Prisma.TransactionWhereInput = { userId };
  if (filters.type) where.type = filters.type;
  if (filters.categoryId) where.categoryId = filters.categoryId;
  if (filters.startDate || filters.endDate) {
    where.date = {
      ...(filters.startDate ? { gte: parseDateOnly(filters.startDate) } : {}),
      ...(filters.endDate ? { lte: parseDateOnly(filters.endDate) } : {}),
    };
  }
  if (filters.search?.trim()) {
    where.OR = [
      { note: { contains: filters.search.trim(), mode: "insensitive" } },
      { category: { name: { contains: filters.search.trim(), mode: "insensitive" } } },
    ];
  }
  return where;
}

async function findOwnedTransaction(userId: string, id: string) {
  return prisma.transaction.findFirst({
    where: { id, userId },
    include: { category: { select: { name: true, color: true } } },
  });
}

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const query = listTransactionsQuery.parse(req.query);
    if (query.startDate && query.endDate && query.startDate > query.endDate) {
      throw new HttpError(400, "Start date must be on or before end date.");
    }
    const userId = getUserId(req);
    const where = buildWhere(userId, query);
    const [rows, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        include: { category: { select: { name: true, color: true } } },
        orderBy: [
          query.sortBy === "amount" ? { amount: query.sortOrder } : { date: query.sortOrder },
          { createdAt: "desc" },
        ],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      prisma.transaction.count({ where }),
    ]);
    res.json({
      items: rows.map(serializeTransaction),
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    });
  }),
);

router.get(
  "/export",
  asyncHandler(async (req, res) => {
    const query = exportTransactionsQuery.parse(req.query);
    if (query.startDate && query.endDate && query.startDate > query.endDate) {
      throw new HttpError(400, "Start date must be on or before end date.");
    }
    const rows = await prisma.transaction.findMany({
      where: buildWhere(getUserId(req), query),
      include: { category: { select: { name: true } } },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    });
    const csv = toCsv([
      ["Date", "Type", "Category", "Amount (EGP)", "Note"],
      ...rows.map((row) => [
        formatDateOnly(row.date),
        row.type,
        row.category?.name ?? "Uncategorized",
        amountAsDecimal(toMinorNumber(row.amount)),
        row.note ?? "",
      ]),
    ]);
    res
      .status(200)
      .type("text/csv")
      .setHeader("Content-Disposition", 'attachment; filename="transactions-export.csv"')
      .send(csv);
  }),
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const { id } = transactionIdParams.parse(req.params);
    const transaction = await findOwnedTransaction(getUserId(req), id);
    if (!transaction) {
      throw new HttpError(404, "Transaction not found.");
    }
    res.json(serializeTransaction(transaction));
  }),
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const data = createTransactionSchema.parse(req.body);
    assertSafeAmount(data.amount);
    const userId = getUserId(req);
    if (!(await ownsCategory(userId, data.categoryId))) {
      throw new HttpError(400, "Choose a category owned by your account.");
    }
    const created = await prisma.transaction.create({
      data: {
        userId,
        categoryId: data.categoryId ?? null,
        amount: BigInt(data.amount),
        type: data.type,
        note: data.note?.trim() ? data.note.trim() : null,
        date: parseDateOnly(data.date),
      },
      include: { category: { select: { name: true, color: true } } },
    });
    res.status(201).json(serializeTransaction(created));
  }),
);

router.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const { id } = transactionIdParams.parse(req.params);
    const data = updateTransactionSchema.parse(req.body);
    if (Object.keys(data).length === 0) {
      throw new HttpError(400, "Provide at least one field to update.");
    }
    if (data.amount !== undefined) assertSafeAmount(data.amount);
    const userId = getUserId(req);
    if (data.categoryId !== undefined && !(await ownsCategory(userId, data.categoryId))) {
      throw new HttpError(400, "Choose a category owned by your account.");
    }
    const existing = await prisma.transaction.findFirst({ where: { id, userId } });
    if (!existing) {
      throw new HttpError(404, "Transaction not found.");
    }
    const updated = await prisma.transaction.update({
      where: { id },
      data: {
        ...(data.categoryId !== undefined ? { categoryId: data.categoryId } : {}),
        ...(data.amount !== undefined ? { amount: BigInt(data.amount) } : {}),
        ...(data.type !== undefined ? { type: data.type } : {}),
        ...(data.note !== undefined ? { note: data.note?.trim() ? data.note.trim() : null } : {}),
        ...(data.date !== undefined ? { date: parseDateOnly(data.date) } : {}),
      },
      include: { category: { select: { name: true, color: true } } },
    });
    res.json(serializeTransaction(updated));
  }),
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const { id } = transactionIdParams.parse(req.params);
    const deleted = await prisma.transaction.deleteMany({
      where: { id, userId: getUserId(req) },
    });
    if (deleted.count === 0) {
      throw new HttpError(404, "Transaction not found.");
    }
    res.status(204).send();
  }),
);

export default router;
