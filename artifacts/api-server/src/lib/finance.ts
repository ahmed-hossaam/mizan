import { and, eq } from "drizzle-orm";
import { db, categoriesTable } from "@workspace/db";

const DEFAULT_CATEGORIES = [
  { name: "Food", color: "#E6A94A" },
  { name: "Transportation", color: "#6A9FE8" },
  { name: "Shopping", color: "#BA83D4" },
  { name: "Bills", color: "#4F8D8B" },
  { name: "Health", color: "#E27B74" },
  { name: "Education", color: "#7183C5" },
  { name: "Entertainment", color: "#D983A9" },
];

export function getMonthDate(month: string): string {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw new Error("Month must use YYYY-MM format with a valid month.");
  }
  return `${month}-01`;
}

export function getMonthBounds(month: string): { start: string; end: string } {
  const start = getMonthDate(month);
  const [year, monthNumber] = month.split("-").map(Number);
  const nextMonth = new Date(Date.UTC(year, monthNumber, 1));
  return {
    start,
    end: new Date(nextMonth.getTime() - 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10),
  };
}

export function cairoCurrentMonth(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  return `${year}-${month}`;
}

export async function ensureDefaultCategories(userId: string): Promise<void> {
  await db
    .insert(categoriesTable)
    .values(DEFAULT_CATEGORIES.map((category) => ({ ...category, userId })))
    .onConflictDoNothing();
}

export async function ownsCategory(
  userId: string,
  categoryId: string | null | undefined,
): Promise<boolean> {
  if (categoryId == null) return true;
  const [category] = await db
    .select({ id: categoriesTable.id })
    .from(categoriesTable)
    .where(and(eq(categoriesTable.id, categoryId), eq(categoriesTable.userId, userId)))
    .limit(1);
  return Boolean(category);
}

export function amountAsNumber(amount: number | string | bigint | null): number {
  const value = Number(amount ?? 0);
  if (!Number.isSafeInteger(value)) {
    throw new Error("The stored amount exceeds the supported safe range.");
  }
  return value;
}

export function isUniqueViolation(error: unknown): boolean {
  let current = error;
  for (let depth = 0; depth < 4; depth += 1) {
    if (typeof current !== "object" || current === null) return false;
    const databaseError = current as { code?: unknown; cause?: unknown };
    if (databaseError.code === "23505") return true;
    current = databaseError.cause;
  }
  return false;
}
