import assert from "node:assert/strict";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { after, afterEach, before, test } from "node:test";
import express from "express";
import type { Server } from "node:http";
import { inArray } from "drizzle-orm";
import { requireIsolatedTestDatabaseUrl } from "./test-database-url.mjs";

const testDatabaseUrl = requireIsolatedTestDatabaseUrl(
  process.env.TEST_DATABASE_URL,
  [process.env.DATABASE_URL, process.env.PRODUCTION_DATABASE_URL],
);
process.env.DATABASE_URL = testDatabaseUrl;

const [
  { budgetsTable, categoriesTable, db, pool, transactionsTable },
  budgetsModule,
  categoriesModule,
  statsModule,
  transactionsModule,
] = await Promise.all([
  import("@workspace/db"),
  import("../src/routes/budgets"),
  import("../src/routes/categories"),
  import("../src/routes/stats"),
  import("../src/routes/transactions"),
]);
const budgetsRouter = budgetsModule.default;
const categoriesRouter = categoriesModule.default;
const statsRouter = statsModule.default;
const transactionsRouter = transactionsModule.default;

const runId = randomUUID();
const users = {
  alice: `test-${runId}-alice`,
  bob: `test-${runId}-bob`,
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

  // This test-only harness injects synthetic identities at the same
  // res.locals.userId boundary that Supabase Auth middleware sets in production.
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
  app.use(
    (
      error: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      res.status(500).json({
        error: error instanceof Error ? error.message : "Unexpected route error.",
      });
    },
  );

  server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("The test API server did not bind to a TCP port.");
  }
  apiBase = `http://127.0.0.1:${address.port}/api`;
});

afterEach(async () => {
  await db.delete(transactionsTable).where(inArray(transactionsTable.userId, userIds));
  await db.delete(budgetsTable).where(inArray(budgetsTable.userId, userIds));
  await db.delete(categoriesTable).where(inArray(categoriesTable.userId, userIds));
});

after(async () => {
  try {
    if (server?.listening) {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  } finally {
    await pool.end();
  }
});

test("transaction CRUD, filtering, and CSV export stay scoped to the account", async () => {
  const ownerCategory = await createCategory(users.alice, `CSV Alice ${runId}`);
  const otherCategory = await createCategory(users.bob, `CSV Bob ${runId}`);
  const { date } = currentCairoDate();
  const note = '=SUM(A1:A2), "quoted"\nsecond line';
  const ownerTransaction = await createTransaction(users.alice, {
    type: "expense",
    amount: 1250,
    categoryId: ownerCategory.id,
    note,
    date: `${date}T12:00:00.000Z`,
  });
  const otherNote = `Other account secret ${runId}`;
  const otherTransaction = await createTransaction(users.bob, {
    type: "expense",
    amount: 777,
    categoryId: otherCategory.id,
    note: otherNote,
    date: `${date}T12:00:00.000Z`,
  });

  const ownerList = await json<{
    total: number;
    items: { id: string; amount: number; note: string }[];
  }>(
    await api("/transactions?search=SUM", users.alice),
  );
  const ownerAllList = await json<{
    total: number;
    items: { id: string; amount: number; note: string }[];
  }>(await api("/transactions", users.alice));
  const otherList = await json<{
    total: number;
    items: { id: string; amount: number; note: string }[];
  }>(
    await api("/transactions", users.bob),
  );
  assert.equal(ownerList.total, 1);
  assert.equal(ownerList.items[0].amount, 1250);
  assert.equal(ownerAllList.total, 1);
  assert.equal(ownerAllList.items[0].id, ownerTransaction.id);
  assert.equal(otherList.total, 1);
  assert.equal(otherList.items[0].id, otherTransaction.id);
  assert.equal(otherList.items[0].amount, 777);
  assert.equal(otherList.items[0].note, otherNote);
  assert.equal((await api(`/transactions/${ownerTransaction.id}`, users.bob)).status, 404);
  assert.equal((await api(`/transactions/${otherTransaction.id}`, users.alice)).status, 404);
  assert.equal(
    (
      await api(`/transactions/${ownerTransaction.id}`, users.bob, {
        method: "PATCH",
        body: JSON.stringify({ amount: 1800 }),
      })
    ).status,
    404,
  );
  assert.equal(
    (await api(`/transactions/${ownerTransaction.id}`, users.bob, { method: "DELETE" })).status,
    404,
  );
  assert.equal(
    (
      await api(`/transactions/${otherTransaction.id}`, users.alice, {
        method: "PATCH",
        body: JSON.stringify({ amount: 1, note: "Tampered" }),
      })
    ).status,
    404,
  );
  assert.equal(
    (await api(`/transactions/${otherTransaction.id}`, users.alice, { method: "DELETE" })).status,
    404,
  );
  assert.equal(
    (
      await api(`/transactions/${ownerTransaction.id}`, users.alice, {
        method: "PATCH",
        body: JSON.stringify({ categoryId: otherCategory.id }),
      })
    ).status,
    400,
  );

  const unchangedOwner = await json<{ amount: number; note: string }>(
    await api(`/transactions/${ownerTransaction.id}`, users.alice),
  );
  const unchangedOther = await json<{ amount: number; note: string }>(
    await api(`/transactions/${otherTransaction.id}`, users.bob),
  );
  assert.equal(unchangedOwner.amount, 1250);
  assert.equal(unchangedOwner.note, note);
  assert.equal(unchangedOther.amount, 777);
  assert.equal(unchangedOther.note, otherNote);

  const exportResponse = await api("/transactions/export", users.alice);
  assert.equal(exportResponse.status, 200);
  assert.match(exportResponse.headers.get("content-type") || "", /text\/csv/);
  assert.match(exportResponse.headers.get("content-disposition") || "", /attachment/);
  const csv = await exportResponse.text();
  assert.match(csv, /"Date","Type","Category","Amount \(EGP\)","Note"/);
  assert.ok(csv.includes("'=SUM(A1:A2)"));
  assert.ok(csv.includes('""quoted""'));
  assert.ok(csv.includes("second line"));
  assert.ok(!csv.includes(otherNote));

  const otherCsv = await (await api("/transactions/export", users.bob)).text();
  assert.ok(!otherCsv.includes("SUM(A1:A2)"));
  assert.ok(otherCsv.includes(otherNote));
  const filteredCsv = await (
    await api("/transactions/export?type=income", users.alice)
  ).text();
  assert.ok(!filteredCsv.includes("SUM(A1:A2)"));

  const invalidAmount = await api("/transactions", users.alice, {
    method: "POST",
    body: JSON.stringify({
      type: "expense",
      amount: 0,
      categoryId: ownerCategory.id,
      date: `${date}T12:00:00.000Z`,
    }),
  });
  assert.equal(invalidAmount.status, 400);

  const updated = await api(`/transactions/${ownerTransaction.id}`, users.alice, {
    method: "PATCH",
    body: JSON.stringify({ amount: 1800, note: "Updated entry" }),
  });
  assert.equal(updated.status, 200);
  assert.equal((await json<{ amount: number; note: string }>(updated)).amount, 1800);
  assert.equal(
    (await api(`/transactions/${ownerTransaction.id}`, users.bob, { method: "DELETE" })).status,
    404,
  );
  assert.equal(
    (await api(`/transactions/${ownerTransaction.id}`, users.alice, { method: "DELETE" })).status,
    204,
  );
  assert.equal(
    (await api(`/transactions/${otherTransaction.id}`, users.bob, { method: "DELETE" })).status,
    204,
  );
});

test("category ownership and references prevent unsafe deletion", async () => {
  const ownCategory = await createCategory(users.alice, `Own ${runId}`);
  const otherCategory = await createCategory(users.bob, `Other ${runId}`);
  const { date, month } = currentCairoDate();
  assert.equal(
    (
      await api("/categories", users.alice, {
        method: "POST",
        body: JSON.stringify({ name: ownCategory.name, color: ownCategory.color }),
      })
    ).status,
    409,
  );

  const renamed = await api(`/categories/${ownCategory.id}`, users.alice, {
    method: "PATCH",
    body: JSON.stringify({ name: `Renamed ${runId}`, color: "#557492" }),
  });
  assert.equal(renamed.status, 200);
  assert.equal(
    (await json<{ name: string }>(renamed)).name,
    `Renamed ${runId}`,
  );
  assert.equal(
    (await api(`/categories/${otherCategory.id}`, users.alice, {
      method: "PATCH",
      body: JSON.stringify({ name: "Should not change" }),
    })).status,
    404,
  );
  const bobCategories = await json<{ id: string; name: string }[]>(
    await api("/categories", users.bob),
  );
  const aliceCategories = await json<{ id: string; name: string }[]>(
    await api("/categories", users.alice),
  );
  assert.ok(!aliceCategories.some((category) => category.id === otherCategory.id));
  assert.equal(
    bobCategories.find((category) => category.id === otherCategory.id)?.name,
    otherCategory.name,
  );

  const foreignCategoryTransaction = await api("/transactions", users.alice, {
    method: "POST",
    body: JSON.stringify({
      type: "expense",
      amount: 100,
      categoryId: otherCategory.id,
      date: `${date}T12:00:00.000Z`,
    }),
  });
  assert.equal(foreignCategoryTransaction.status, 400);
  const foreignCategoryBudget = await api("/budgets", users.alice, {
    method: "POST",
    body: JSON.stringify({
      categoryId: otherCategory.id,
      month,
      limitAmount: 3000,
    }),
  });
  assert.equal(foreignCategoryBudget.status, 400);
  assert.equal(
    (await api(`/categories/${otherCategory.id}`, users.alice, { method: "DELETE" }))
      .status,
    404,
  );
  const bobCategoriesAfterDeleteAttempt = await json<{ id: string; name: string }[]>(
    await api("/categories", users.bob),
  );
  assert.equal(
    bobCategoriesAfterDeleteAttempt.find((category) => category.id === otherCategory.id)?.name,
    otherCategory.name,
  );

  const ownBudgetResponse = await api("/budgets", users.alice, {
    method: "POST",
    body: JSON.stringify({
      categoryId: ownCategory.id,
      month,
      limitAmount: 2500,
    }),
  });
  assert.equal(ownBudgetResponse.status, 201);
  const ownBudget = await json<{ id: string }>(ownBudgetResponse);
  const budgetResponse = await api("/budgets", users.bob, {
    method: "POST",
    body: JSON.stringify({
      categoryId: otherCategory.id,
      month,
      limitAmount: 5000,
    }),
  });
  assert.equal(budgetResponse.status, 201);
  const bobBudget = await json<{ id: string }>(budgetResponse);
  assert.equal(
    (await api(`/budgets/${bobBudget.id}`, users.alice, {
      method: "PATCH",
      body: JSON.stringify({ limitAmount: 1 }),
    })).status,
    404,
  );
  assert.equal(
    (await api(`/budgets/${bobBudget.id}`, users.alice, { method: "DELETE" })).status,
    404,
  );
  const unchangedBobBudgets = await json<{ id: string; limitAmount: number }[]>(
    await api(`/budgets?month=${month}`, users.bob),
  );
  assert.equal(unchangedBobBudgets.length, 1);
  assert.equal(unchangedBobBudgets[0].id, bobBudget.id);
  assert.equal(unchangedBobBudgets[0].limitAmount, 5000);
  assert.equal(
    (await api(`/categories/${otherCategory.id}`, users.bob, { method: "DELETE" }))
      .status,
    409,
  );
  assert.equal(
    (await api(`/budgets/${bobBudget.id}`, users.bob, { method: "DELETE" })).status,
    204,
  );
  assert.equal(
    (await api(`/categories/${otherCategory.id}`, users.bob, { method: "DELETE" })).status,
    204,
  );
  assert.equal(
    (await api(`/budgets/${ownBudget.id}`, users.alice, { method: "DELETE" })).status,
    204,
  );

  const transaction = await createTransaction(users.alice, {
    type: "expense",
    amount: 200,
    categoryId: ownCategory.id,
    date: `${date}T12:00:00.000Z`,
  });
  assert.equal(
    (await api(`/categories/${ownCategory.id}`, users.alice, { method: "DELETE" }))
      .status,
    409,
  );
  await api(`/transactions/${transaction.id}`, users.alice, { method: "DELETE" });
  assert.equal(
    (await api(`/categories/${ownCategory.id}`, users.alice, { method: "DELETE" }))
      .status,
    204,
  );
});

test("budgets and monthly statistics aggregate only the owner's expenses", async () => {
  const category = await createCategory(users.alice, `Budget Alice ${runId}`);
  const otherCategory = await createCategory(users.bob, `Budget Bob ${runId}`);
  const { date, month } = currentCairoDate();
  const budgetResponse = await api("/budgets", users.alice, {
    method: "POST",
    body: JSON.stringify({ categoryId: category.id, month, limitAmount: 5000 }),
  });
  assert.equal(budgetResponse.status, 201);
  const aliceBudget = await json<{ id: string }>(budgetResponse);
  const bobBudgetResponse = await api("/budgets", users.bob, {
    method: "POST",
    body: JSON.stringify({ categoryId: otherCategory.id, month, limitAmount: 10000 }),
  });
  assert.equal(bobBudgetResponse.status, 201);
  const bobBudget = await json<{ id: string }>(bobBudgetResponse);

  const duplicateBudget = await api("/budgets", users.alice, {
    method: "POST",
    body: JSON.stringify({ categoryId: category.id, month, limitAmount: 5000 }),
  });
  assert.equal(duplicateBudget.status, 409, await duplicateBudget.text());

  await createTransaction(users.alice, {
    type: "expense",
    amount: 1250,
    categoryId: category.id,
    note: "Groceries",
    date: `${date}T12:00:00.000Z`,
  });
  await createTransaction(users.alice, {
    type: "expense",
    amount: 200,
    categoryId: category.id,
    note: "Coffee",
    date: `${date}T12:00:00.000Z`,
  });
  await createTransaction(users.alice, {
    type: "income",
    amount: 2000,
    note: "Pay",
    date: `${date}T12:00:00.000Z`,
  });
  await createTransaction(users.bob, {
    type: "expense",
    amount: 8000,
    categoryId: otherCategory.id,
    note: "Bob travel",
    date: `${date}T12:00:00.000Z`,
  });
  await createTransaction(users.bob, {
    type: "income",
    amount: 9000,
    note: "Bob salary",
    date: `${date}T12:00:00.000Z`,
  });

  const budgets = await json<
    {
      id: string;
      categoryId: string;
      spent: number;
      remaining: number;
      percentage: number;
    }[]
  >(await api(`/budgets?month=${month}`, users.alice));
  assert.equal(budgets.length, 1);
  assert.equal(budgets[0].id, aliceBudget.id);
  assert.equal(budgets[0].categoryId, category.id);
  assert.equal(budgets[0].spent, 1450);
  assert.equal(budgets[0].remaining, 3550);
  assert.equal(budgets[0].percentage, 29);

  const bobBudgets = await json<
    { id: string; categoryId: string; spent: number; remaining: number; percentage: number }[]
  >(await api(`/budgets?month=${month}`, users.bob));
  assert.equal(bobBudgets.length, 1);
  assert.equal(bobBudgets[0].id, bobBudget.id);
  assert.equal(bobBudgets[0].categoryId, otherCategory.id);
  assert.equal(bobBudgets[0].spent, 8000);
  assert.equal(bobBudgets[0].remaining, 2000);
  assert.equal(bobBudgets[0].percentage, 80);

  const stats = await json<{
    totalIncome: number;
    totalExpenses: number;
    netBalance: number;
    transactionCount: number;
    categoryBreakdown: { categoryId: string; amount: number }[];
    recentTransactions: { note: string | null }[];
  }>(await api(`/stats/monthly?month=${month}`, users.alice));
  assert.equal(stats.totalIncome, 2000);
  assert.equal(stats.totalExpenses, 1450);
  assert.equal(stats.netBalance, 550);
  assert.equal(stats.transactionCount, 3);
  assert.equal(stats.categoryBreakdown[0].categoryId, category.id);
  assert.equal(stats.categoryBreakdown[0].amount, 1450);
  assert.equal(stats.recentTransactions.length, 3);
  assert.ok(stats.recentTransactions.every((transaction) => !transaction.note?.startsWith("Bob")));

  const trends = await json<{ month: string; income: number; expenses: number }[]>(
    await api("/stats/trends", users.alice),
  );
  const currentMonthTrend = trends.find((item) => item.month === month);
  assert.deepEqual(currentMonthTrend, { month, income: 2000, expenses: 1450 });

  const bobStats = await json<{
    totalIncome: number;
    totalExpenses: number;
    netBalance: number;
    transactionCount: number;
    categoryBreakdown: { categoryId: string; amount: number }[];
    recentTransactions: { note: string | null }[];
  }>(await api(`/stats/monthly?month=${month}`, users.bob));
  assert.equal(bobStats.totalIncome, 9000);
  assert.equal(bobStats.totalExpenses, 8000);
  assert.equal(bobStats.netBalance, 1000);
  assert.equal(bobStats.transactionCount, 2);
  assert.equal(bobStats.categoryBreakdown.length, 1);
  assert.equal(bobStats.categoryBreakdown[0].categoryId, otherCategory.id);
  assert.equal(bobStats.categoryBreakdown[0].amount, 8000);
  assert.ok(
    bobStats.recentTransactions.every(
      (transaction) =>
        !transaction.note?.startsWith("Groceries") &&
        !transaction.note?.startsWith("Coffee") &&
        transaction.note !== "Pay",
    ),
  );

  const bobTrends = await json<{ month: string; income: number; expenses: number }[]>(
    await api("/stats/trends", users.bob),
  );
  assert.deepEqual(
    bobTrends.find((item) => item.month === month),
    { month, income: 9000, expenses: 8000 },
  );

  const updated = await api(`/budgets/${aliceBudget.id}`, users.alice, {
    method: "PATCH",
    body: JSON.stringify({ limitAmount: 6000 }),
  });
  assert.equal(updated.status, 200);
  assert.equal((await json<{ remaining: number }>(updated)).remaining, 4550);
  assert.equal(
    (await api(`/budgets/${aliceBudget.id}`, users.alice, { method: "DELETE" })).status,
    204,
  );
});
