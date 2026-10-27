import assert from "node:assert/strict";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import express from "express";
import type { Server } from "node:http";
import { inArray } from "drizzle-orm";
import {
  budgetsTable,
  categoriesTable,
  db,
  pool,
  transactionsTable,
} from "@workspace/db";
import budgetsRouter from "../src/routes/budgets";
import categoriesRouter from "../src/routes/categories";
import statsRouter from "../src/routes/stats";
import transactionsRouter from "../src/routes/transactions";

const runId = randomUUID();
const users = {
  transactionOwner: `test-${runId}-transactions`,
  transactionOther: `test-${runId}-transactions-other`,
  categoryOwner: `test-${runId}-categories`,
  categoryOther: `test-${runId}-categories-other`,
  budgetOwner: `test-${runId}-budgets`,
  budgetOther: `test-${runId}-budgets-other`,
};
const userIds = Object.values(users);

let server: Server;
let apiBase = "";

function currentCairoDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = (type: string) => parts.find((part) => part.type === type)?.value;
  const month = `${value("year")}-${value("month")}`;
  return { month, date: `${month}-${value("day")}` };
}

async function api(
  path: string,
  userId: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("x-test-user-id", userId);
  if (init.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  return fetch(`${apiBase}${path}`, { ...init, headers });
}

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function createCategory(userId: string, name: string) {
  const response = await api("/categories", userId, {
    method: "POST",
    body: JSON.stringify({ name, color: "#438D6A" }),
  });
  assert.equal(response.status, 201);
  return json<{ id: string; name: string; color: string }>(response);
}

async function createTransaction(
  userId: string,
  input: {
    type: "income" | "expense";
    amount: number;
    categoryId?: string | null;
    note?: string | null;
    date: string;
  },
) {
  const response = await api("/transactions", userId, {
    method: "POST",
    body: JSON.stringify(input),
  });
  assert.equal(response.status, 201);
  return json<{ id: string; amount: number; note: string | null }>(response);
}

before(async () => {
  const app = express();
  app.use(express.json());

  // Route tests use synthetic identities; production auth is checked separately
  // through the real API workflow and Clerk middleware.
  app.use((req, res, next) => {
    const userId = req.header("x-test-user-id");
    if (!userId) {
      res.status(401).json({ error: "Sign in is required." });
      return;
    }
    res.locals.userId = userId;
    next();
  });

  app.use("/api", transactionsRouter);
  app.use("/api", categoriesRouter);
  app.use("/api", budgetsRouter);
  app.use("/api", statsRouter);
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unexpected route error.",
    });
  });

  server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("The test API server did not bind to a TCP port.");
  }
  apiBase = `http://127.0.0.1:${address.port}/api`;
});

after(async () => {
  try {
    await db.delete(transactionsTable).where(inArray(transactionsTable.userId, userIds));
    await db.delete(budgetsTable).where(inArray(budgetsTable.userId, userIds));
    await db.delete(categoriesTable).where(inArray(categoriesTable.userId, userIds));
  } finally {
    if (server?.listening) {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
    await pool.end();
  }
});

test("transaction CRUD, filtering, and CSV export stay scoped to the account", async () => {
  const category = await createCategory(users.transactionOwner, `CSV ${runId}`);
  const { date } = currentCairoDate();
  const note = '=SUM(A1:A2), "quoted"\nsecond line';
  const transaction = await createTransaction(users.transactionOwner, {
    type: "expense",
    amount: 1250,
    categoryId: category.id,
    note,
    date: `${date}T12:00:00.000Z`,
  });

  const ownerList = await json<{ total: number; items: { id: string; amount: number }[] }>(
    await api("/transactions?search=SUM", users.transactionOwner),
  );
  const otherList = await json<{ total: number; items: unknown[] }>(
    await api("/transactions", users.transactionOther),
  );
  assert.equal(ownerList.total, 1);
  assert.equal(ownerList.items[0].amount, 1250);
  assert.equal(otherList.total, 0);
  assert.equal((await api(`/transactions/${transaction.id}`, users.transactionOther)).status, 404);
  assert.equal(
    (
      await api(`/transactions/${transaction.id}`, users.transactionOther, {
        method: "PATCH",
        body: JSON.stringify({ amount: 1800 }),
      })
    ).status,
    404,
  );

  const exportResponse = await api("/transactions/export", users.transactionOwner);
  assert.equal(exportResponse.status, 200);
  assert.match(exportResponse.headers.get("content-type") || "", /text\/csv/);
  assert.match(exportResponse.headers.get("content-disposition") || "", /attachment/);
  const csv = await exportResponse.text();
  assert.match(csv, /"Date","Type","Category","Amount \(EGP\)","Note"/);
  assert.ok(csv.includes("'=SUM(A1:A2)"));
  assert.ok(csv.includes('""quoted""'));
  assert.ok(csv.includes("second line"));

  const otherCsv = await (await api("/transactions/export", users.transactionOther)).text();
  assert.ok(!otherCsv.includes("SUM(A1:A2)"));
  const filteredCsv = await (
    await api("/transactions/export?type=income", users.transactionOwner)
  ).text();
  assert.ok(!filteredCsv.includes("SUM(A1:A2)"));

  const invalidAmount = await api("/transactions", users.transactionOwner, {
    method: "POST",
    body: JSON.stringify({
      type: "expense",
      amount: 0,
      categoryId: category.id,
      date: `${date}T12:00:00.000Z`,
    }),
  });
  assert.equal(invalidAmount.status, 400);

  const updated = await api(`/transactions/${transaction.id}`, users.transactionOwner, {
    method: "PATCH",
    body: JSON.stringify({ amount: 1800, note: "Updated entry" }),
  });
  assert.equal(updated.status, 200);
  assert.equal((await json<{ amount: number; note: string }>(updated)).amount, 1800);
  assert.equal(
    (await api(`/transactions/${transaction.id}`, users.transactionOther, { method: "DELETE" }))
      .status,
    404,
  );
  assert.equal(
    (await api(`/transactions/${transaction.id}`, users.transactionOwner, { method: "DELETE" }))
      .status,
    204,
  );
});

test("category ownership and references prevent unsafe deletion", async () => {
  const ownCategory = await createCategory(users.categoryOwner, `Own ${runId}`);
  const otherCategory = await createCategory(users.categoryOther, `Other ${runId}`);
  const { date, month } = currentCairoDate();
  assert.equal(
    (
      await api("/categories", users.categoryOwner, {
        method: "POST",
        body: JSON.stringify({ name: ownCategory.name, color: ownCategory.color }),
      })
    ).status,
    409,
  );

  const renamed = await api(`/categories/${ownCategory.id}`, users.categoryOwner, {
    method: "PATCH",
    body: JSON.stringify({ name: `Renamed ${runId}`, color: "#557492" }),
  });
  assert.equal(renamed.status, 200);
  assert.equal(
    (await json<{ name: string }>(renamed)).name,
    `Renamed ${runId}`,
  );
  assert.equal(
    (await api(`/categories/${otherCategory.id}`, users.categoryOwner, {
      method: "PATCH",
      body: JSON.stringify({ name: "Should not change" }),
    })).status,
    404,
  );

  const foreignCategoryTransaction = await api("/transactions", users.categoryOwner, {
    method: "POST",
    body: JSON.stringify({
      type: "expense",
      amount: 100,
      categoryId: otherCategory.id,
      date: `${date}T12:00:00.000Z`,
    }),
  });
  assert.equal(foreignCategoryTransaction.status, 400);
  assert.equal(
    (await api(`/categories/${otherCategory.id}`, users.categoryOwner, { method: "DELETE" }))
      .status,
    404,
  );

  const budgetResponse = await api("/budgets", users.categoryOther, {
    method: "POST",
    body: JSON.stringify({
      categoryId: otherCategory.id,
      month,
      limitAmount: 5000,
    }),
  });
  assert.equal(budgetResponse.status, 201);
  const budget = await json<{ id: string }>(budgetResponse);
  assert.equal(
    (await api(`/categories/${otherCategory.id}`, users.categoryOther, { method: "DELETE" }))
      .status,
    409,
  );
  assert.equal(
    (await api(`/budgets/${budget.id}`, users.categoryOther, { method: "DELETE" })).status,
    204,
  );
  assert.equal(
    (await api(`/categories/${otherCategory.id}`, users.categoryOther, { method: "DELETE" }))
      .status,
    204,
  );

  const transaction = await createTransaction(users.categoryOwner, {
    type: "expense",
    amount: 200,
    categoryId: ownCategory.id,
    date: `${date}T12:00:00.000Z`,
  });
  assert.equal(
    (await api(`/categories/${ownCategory.id}`, users.categoryOwner, { method: "DELETE" }))
      .status,
    409,
  );
  await api(`/transactions/${transaction.id}`, users.categoryOwner, { method: "DELETE" });
  assert.equal(
    (await api(`/categories/${ownCategory.id}`, users.categoryOwner, { method: "DELETE" }))
      .status,
    204,
  );
});

test("budgets and monthly statistics aggregate only the owner's expenses", async () => {
  const category = await createCategory(users.budgetOwner, `Budget ${runId}`);
  const { date, month } = currentCairoDate();
  const budgetResponse = await api("/budgets", users.budgetOwner, {
    method: "POST",
    body: JSON.stringify({ categoryId: category.id, month, limitAmount: 5000 }),
  });
  assert.equal(budgetResponse.status, 201);
  const budget = await json<{ id: string }>(budgetResponse);

  const duplicateBudget = await api("/budgets", users.budgetOwner, {
    method: "POST",
    body: JSON.stringify({ categoryId: category.id, month, limitAmount: 5000 }),
  });
  assert.equal(duplicateBudget.status, 409, await duplicateBudget.text());

  await createTransaction(users.budgetOwner, {
    type: "expense",
    amount: 1250,
    categoryId: category.id,
    note: "Groceries",
    date: `${date}T12:00:00.000Z`,
  });
  await createTransaction(users.budgetOwner, {
    type: "expense",
    amount: 200,
    categoryId: category.id,
    note: "Coffee",
    date: `${date}T12:00:00.000Z`,
  });
  await createTransaction(users.budgetOwner, {
    type: "income",
    amount: 2000,
    note: "Pay",
    date: `${date}T12:00:00.000Z`,
  });

  const budgets = await json<
    { id: string; spent: number; remaining: number; percentage: number }[]
  >(await api(`/budgets?month=${month}`, users.budgetOwner));
  assert.equal(budgets.length, 1);
  assert.equal(budgets[0].spent, 1450);
  assert.equal(budgets[0].remaining, 3550);
  assert.equal(budgets[0].percentage, 29);

  const stats = await json<{
    totalIncome: number;
    totalExpenses: number;
    netBalance: number;
    transactionCount: number;
    categoryBreakdown: { categoryId: string; amount: number }[];
    recentTransactions: unknown[];
  }>(await api(`/stats/monthly?month=${month}`, users.budgetOwner));
  assert.equal(stats.totalIncome, 2000);
  assert.equal(stats.totalExpenses, 1450);
  assert.equal(stats.netBalance, 550);
  assert.equal(stats.transactionCount, 3);
  assert.equal(stats.categoryBreakdown[0].categoryId, category.id);
  assert.equal(stats.categoryBreakdown[0].amount, 1450);
  assert.equal(stats.recentTransactions.length, 3);

  const trends = await json<{ month: string; income: number; expenses: number }[]>(
    await api("/stats/trends", users.budgetOwner),
  );
  const currentMonthTrend = trends.find((item) => item.month === month);
  assert.deepEqual(currentMonthTrend, { month, income: 2000, expenses: 1450 });

  const otherBudgets = await json<unknown[]>(
    await api(`/budgets?month=${month}`, users.budgetOther),
  );
  const otherStats = await json<{ transactionCount: number; totalExpenses: number }>(
    await api(`/stats/monthly?month=${month}`, users.budgetOther),
  );
  assert.equal(otherBudgets.length, 0);
  assert.equal(otherStats.transactionCount, 0);
  assert.equal(otherStats.totalExpenses, 0);
  assert.equal(
    (await api(`/budgets/${budget.id}`, users.budgetOther, {
      method: "PATCH",
      body: JSON.stringify({ limitAmount: 6000 }),
    })).status,
    404,
  );

  const updated = await api(`/budgets/${budget.id}`, users.budgetOwner, {
    method: "PATCH",
    body: JSON.stringify({ limitAmount: 6000 }),
  });
  assert.equal(updated.status, 200);
  assert.equal((await json<{ remaining: number }>(updated)).remaining, 4550);
  assert.equal(
    (await api(`/budgets/${budget.id}`, users.budgetOwner, { method: "DELETE" })).status,
    204,
  );
});
