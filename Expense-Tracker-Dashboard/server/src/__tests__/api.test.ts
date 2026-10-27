import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { prisma } from "../config/prisma.js";
import { app } from "../app.js";
import { amountAsDecimal } from "../utils/money.js";
import { escapeCsvCell, toCsv } from "../utils/csv.js";

const suffix = Date.now();
const userA = { email: `a-${suffix}@example.com`, password: "password12" };
const userB = { email: `b-${suffix}@example.com`, password: "password34" };

function agent() {
  return request.agent(app);
}

async function signup(creds: { email: string; password: string }) {
  const client = agent();
  const response = await client.post("/api/auth/signup").send(creds);
  return { client, response };
}

describe("expense tracker API", () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { email: { in: [userA.email, userB.email] } },
    });
    await prisma.$disconnect();
  });

  it("validates signup and login payloads", async () => {
    const invalidEmail = await request(app).post("/api/auth/signup").send({
      email: "not-an-email",
      password: "password12",
    });
    expect(invalidEmail.status).toBe(400);

    const shortPassword = await request(app).post("/api/auth/signup").send({
      email: `short-${suffix}@example.com`,
      password: "123",
    });
    expect(shortPassword.status).toBe(400);

    const invalidLogin = await request(app).post("/api/auth/login").send({
      email: "nobody@example.com",
      password: "nope",
    });
    expect(invalidLogin.status).toBe(400);
  });

  it("creates accounts, restores sessions, and rejects duplicate emails", async () => {
    const first = await signup(userA);
    expect(first.response.status).toBe(201);
    expect(first.response.body.passwordHash).toBeUndefined();
    expect(first.response.body.email).toBe(userA.email);

    const me = await first.client.get("/api/auth/me");
    expect(me.status).toBe(200);
    expect(me.body.email).toBe(userA.email);

    const duplicate = await request(app).post("/api/auth/signup").send(userA);
    expect(duplicate.status).toBe(409);

    const wrong = await request(app).post("/api/auth/login").send({
      email: userA.email,
      password: "wrong-password",
    });
    expect(wrong.status).toBe(401);

    await first.client.post("/api/auth/logout");
    const loggedOut = await first.client.get("/api/auth/me");
    expect(loggedOut.status).toBe(401);

    const login = await first.client.post("/api/auth/login").send(userA);
    expect(login.status).toBe(200);
  });

  it("protects private endpoints", async () => {
    const response = await request(app).get("/api/transactions");
    expect(response.status).toBe(401);
  });

  it("isolates user data and validates category ownership", async () => {
    const a = await signup(userA);
    const b = await signup(userB);
    if (a.response.status === 409) {
      await a.client.post("/api/auth/login").send(userA);
    }
    const categoriesA = await a.client.get("/api/categories");
    const categoriesB = await b.client.get("/api/categories");
    expect(categoriesA.status).toBe(200);
    expect(categoriesA.body.length).toBeGreaterThan(0);
    const foreignCategory = categoriesB.body[0];

    const stolen = await a.client.post("/api/transactions").send({
      type: "expense",
      amount: 1500,
      categoryId: foreignCategory.id,
      date: "2026-10-01",
      note: "should fail",
    });
    expect(stolen.status).toBe(400);

    const created = await a.client.post("/api/transactions").send({
      type: "expense",
      amount: 2500,
      categoryId: categoriesA.body[0].id,
      date: "2026-10-02",
      note: "groceries",
    });
    expect(created.status).toBe(201);

    const peek = await b.client.get(`/api/transactions/${created.body.id}`);
    expect(peek.status).toBe(404);

    const listB = await b.client.get("/api/transactions");
    expect(listB.body.items).toHaveLength(0);
  });

  it("supports transaction CRUD, filters, monthly stats, budgets, and CSV export", async () => {
    const { client, response } = await signup({
      email: `flow-${suffix}@example.com`,
      password: "password12",
    });
    expect([201, 409]).toContain(response.status);
    if (response.status === 409) {
      await client.post("/api/auth/login").send({
        email: `flow-${suffix}@example.com`,
        password: "password12",
      });
    }

    const categories = await client.get("/api/categories");
    const food = categories.body.find((item: { name: string }) => item.name === "Food");
    const bills = categories.body.find((item: { name: string }) => item.name === "Bills");

    const expense = await client.post("/api/transactions").send({
      type: "expense",
      amount: 10000,
      categoryId: food.id,
      date: "2026-10-05",
      note: "market",
    });
    expect(expense.status).toBe(201);

    const income = await client.post("/api/transactions").send({
      type: "income",
      amount: 50000,
      date: "2026-10-01",
      note: "salary",
    });
    expect(income.status).toBe(201);

    const updated = await client.patch(`/api/transactions/${expense.body.id}`).send({
      amount: 12000,
    });
    expect(updated.status).toBe(200);
    expect(updated.body.amount).toBe(12000);

    const filtered = await client.get("/api/transactions").query({
      search: "market",
      type: "expense",
      page: 1,
      limit: 10,
    });
    expect(filtered.body.total).toBe(1);

    const stats = await client.get("/api/stats/monthly").query({ month: "2026-10" });
    expect(stats.status).toBe(200);
    expect(stats.body.totalIncome).toBe(50000);
    expect(stats.body.totalExpenses).toBe(12000);
    expect(stats.body.netBalance).toBe(38000);

    const budget = await client.post("/api/budgets").send({
      categoryId: food.id,
      month: "2026-10",
      limitAmount: 20000,
    });
    expect(budget.status).toBe(201);
    expect(budget.body.spent).toBe(12000);
    expect(budget.body.remaining).toBe(8000);
    expect(budget.body.percentage).toBe(60);

    const duplicateBudget = await client.post("/api/budgets").send({
      categoryId: food.id,
      month: "2026-10",
      limitAmount: 10000,
    });
    expect(duplicateBudget.status).toBe(409);

    const inUse = await client.delete(`/api/categories/${food.id}`);
    expect(inUse.status).toBe(409);

    const csv = await client.get("/api/transactions/export").query({ type: "expense" });
    expect(csv.status).toBe(200);
    expect(csv.headers["content-type"]).toMatch(/text\/csv/);
    expect(csv.text).toContain("Date,Type,Category,Amount (EGP),Note");
    expect(csv.text).toContain("120.00");
    expect(csv.text).not.toContain("salary");

    const injected = escapeCsvCell("=CMD()");
    expect(injected.startsWith(`"'`)).toBe(true);
    expect(toCsv([["a,b"]])).toBe(`"a,b"`);
    expect(amountAsDecimal(12000)).toBe("120.00");

    await client.delete(`/api/transactions/${income.body.id}`);
    const missing = await client.get(`/api/transactions/${income.body.id}`);
    expect(missing.status).toBe(404);

    await prisma.user.deleteMany({ where: { email: `flow-${suffix}@example.com` } });
    void bills;
  });
});
