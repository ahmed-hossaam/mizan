import { Router, type IRouter } from "express";
import { and, asc, count, desc, eq, gte, ilike, lte, or, sum } from "drizzle-orm";
import {
  CreateTransactionBody,
  CreateTransactionResponse,
  DeleteTransactionParams,
  ExportTransactionsQueryParams,
  GetTransactionParams,
  GetTransactionResponse,
  ListTransactionsQueryParams,
  ListTransactionsResponse,
  UpdateTransactionBody,
  UpdateTransactionParams,
  UpdateTransactionResponse,
} from "@workspace/api-zod";
import { db, categoriesTable, transactionsTable } from "@workspace/db";
import { getRequestUserId } from "../middlewares/requireAuth";
import { amountAsNumber, ownsCategory } from "../lib/finance";

const router: IRouter = Router();

async function findTransaction(userId: string, id: string) {
  const [row] = await db
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
    .where(and(eq(transactionsTable.id, id), eq(transactionsTable.userId, userId)))
    .limit(1);
  return row ? { ...row, amount: amountAsNumber(row.amount) } : undefined;
}

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function escapeCsvCell(value: string): string {
  let safe = value;
  if (/^[\t\r ]*[=+\-@]/.test(safe)) safe = `'${safe}`;
  return `"${safe.replaceAll('"', '""')}"`;
}

function amountAsDecimal(amount: number): string {
  return `${Math.floor(amount / 100)}.${String(amount % 100).padStart(2, "0")}`;
}

function filtersFromQuery(
  userId: string,
  filters: {
    search?: string;
    type?: "income" | "expense";
    categoryId?: string;
    startDate?: string;
    endDate?: string;
  },
) {
  const conditions = [eq(transactionsTable.userId, userId)];
  if (filters.type) conditions.push(eq(transactionsTable.type, filters.type));
  if (filters.categoryId) conditions.push(eq(transactionsTable.categoryId, filters.categoryId));
  if (filters.startDate) conditions.push(gte(transactionsTable.date, filters.startDate));
  if (filters.endDate) conditions.push(lte(transactionsTable.date, filters.endDate));
  if (filters.search?.trim()) {
    const term = `%${filters.search.trim()}%`;
    conditions.push(
      or(ilike(transactionsTable.note, term), ilike(categoriesTable.name, term))!,
    );
  }
  return and(...conditions);
}

router.get("/transactions", async (req, res): Promise<void> => {
  const parsed = ListTransactionsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { page, limit, search, type, categoryId, startDate, endDate, sortBy, sortOrder } =
    parsed.data;
  if (startDate && endDate && startDate > endDate) {
    res.status(400).json({ error: "Start date must be on or before end date." });
    return;
  }

  const userId = getRequestUserId(res);
  const where = filtersFromQuery(userId, {
    search,
    type,
    categoryId,
    startDate,
    endDate,
  });
  const [rows, [{ total }]] = await Promise.all([
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
      .where(where)
      .orderBy(
        sortBy === "amount"
          ? sortOrder === "asc"
            ? asc(transactionsTable.amount)
            : desc(transactionsTable.amount)
          : sortOrder === "asc"
            ? asc(transactionsTable.date)
            : desc(transactionsTable.date),
        desc(transactionsTable.createdAt),
      )
      .limit(limit)
      .offset((page - 1) * limit),
    db
      .select({ total: count() })
      .from(transactionsTable)
      .leftJoin(categoriesTable, eq(transactionsTable.categoryId, categoriesTable.id))
      .where(where),
  ]);
  const data = ListTransactionsResponse.parse({
    items: rows.map((row) => ({ ...row, amount: amountAsNumber(row.amount) })),
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  });
  res.json(data);
});

router.get("/transactions/export", async (req, res): Promise<void> => {
  const parsed = ExportTransactionsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { search, type, categoryId, startDate, endDate } = parsed.data;
  if (startDate && endDate && startDate > endDate) {
    res.status(400).json({ error: "Start date must be on or before end date." });
    return;
  }
  const userId = getRequestUserId(res);
  const rows = await db
    .select({
      categoryName: categoriesTable.name,
      amount: transactionsTable.amount,
      type: transactionsTable.type,
      note: transactionsTable.note,
      date: transactionsTable.date,
    })
    .from(transactionsTable)
    .leftJoin(categoriesTable, eq(transactionsTable.categoryId, categoriesTable.id))
    .where(filtersFromQuery(userId, { search, type, categoryId, startDate, endDate }))
    .orderBy(desc(transactionsTable.date), desc(transactionsTable.createdAt));

  const csvRows = [
    ["Date", "Type", "Category", "Amount (EGP)", "Note"].map(escapeCsvCell).join(","),
    ...rows.map((row) => {
      const amount = amountAsNumber(row.amount);
      return [
        row.date,
        row.type,
        row.categoryName ?? "Uncategorized",
        amountAsDecimal(amount),
        row.note ?? "",
      ]
        .map(escapeCsvCell)
        .join(",");
    }),
  ];
  res
    .status(200)
    .type("text/csv")
    .setHeader("Content-Disposition", 'attachment; filename="transactions-export.csv"')
    .send(csvRows.join("\r\n"));
});

router.get("/transactions/:id", async (req, res): Promise<void> => {
  const params = GetTransactionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const transaction = await findTransaction(getRequestUserId(res), params.data.id);
  if (!transaction) {
    res.status(404).json({ error: "Transaction not found." });
    return;
  }
  res.json(GetTransactionResponse.parse(transaction));
});

router.post("/transactions", async (req, res): Promise<void> => {
  const parsed = CreateTransactionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (!Number.isSafeInteger(parsed.data.amount)) {
    res.status(400).json({ error: "Amount is outside the supported range." });
    return;
  }
  const userId = getRequestUserId(res);
  const categoryId = parsed.data.categoryId ?? null;
  if (!(await ownsCategory(userId, categoryId))) {
    res.status(400).json({ error: "Choose a category owned by your account." });
    return;
  }
  const [created] = await db
    .insert(transactionsTable)
    .values({
      userId,
      categoryId,
      amount: parsed.data.amount,
      type: parsed.data.type,
      note: parsed.data.note ?? null,
      date: dateOnly(parsed.data.date),
    })
    .returning({ id: transactionsTable.id });
  const transaction = await findTransaction(userId, created.id);
  res.status(201).json(CreateTransactionResponse.parse(transaction));
});

router.patch("/transactions/:id", async (req, res): Promise<void> => {
  const params = UpdateTransactionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateTransactionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const userId = getRequestUserId(res);
  if (parsed.data.amount !== undefined && !Number.isSafeInteger(parsed.data.amount)) {
    res.status(400).json({ error: "Amount is outside the supported range." });
    return;
  }
  if (
    parsed.data.categoryId !== undefined &&
    !(await ownsCategory(userId, parsed.data.categoryId))
  ) {
    res.status(400).json({ error: "Choose a category owned by your account." });
    return;
  }

  const updates = {
    ...(parsed.data.categoryId !== undefined
      ? { categoryId: parsed.data.categoryId }
      : {}),
    ...(parsed.data.amount !== undefined ? { amount: parsed.data.amount } : {}),
    ...(parsed.data.type !== undefined ? { type: parsed.data.type } : {}),
    ...(parsed.data.note !== undefined ? { note: parsed.data.note } : {}),
    ...(parsed.data.date !== undefined ? { date: dateOnly(parsed.data.date) } : {}),
  };
  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "Provide at least one field to update." });
    return;
  }
  const [updated] = await db
    .update(transactionsTable)
    .set(updates)
    .where(
      and(
        eq(transactionsTable.id, params.data.id),
        eq(transactionsTable.userId, userId),
      ),
    )
    .returning({ id: transactionsTable.id });
  if (!updated) {
    res.status(404).json({ error: "Transaction not found." });
    return;
  }
  res.json(UpdateTransactionResponse.parse(await findTransaction(userId, updated.id)));
});

router.delete("/transactions/:id", async (req, res): Promise<void> => {
  const params = DeleteTransactionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [deleted] = await db
    .delete(transactionsTable)
    .where(
      and(
        eq(transactionsTable.id, params.data.id),
        eq(transactionsTable.userId, getRequestUserId(res)),
      ),
    )
    .returning({ id: transactionsTable.id });
  if (!deleted) {
    res.status(404).json({ error: "Transaction not found." });
    return;
  }
  res.sendStatus(204);
});

export default router;
