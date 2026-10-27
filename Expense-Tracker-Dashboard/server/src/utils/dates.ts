export function getMonthDate(month: string): Date {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw new Error("Month must use YYYY-MM format with a valid month.");
  }
  return new Date(`${month}-01T00:00:00.000Z`);
}

export function getMonthBounds(month: string): { start: Date; end: Date } {
  const start = getMonthDate(month);
  const [year, monthNumber] = month.split("-").map(Number);
  const end = new Date(Date.UTC(year, monthNumber, 0));
  return { start, end };
}

export function cairoCurrentMonth(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  return `${parts.find((part) => part.type === "year")?.value}-${parts.find((part) => part.type === "month")?.value}`;
}

export function parseDateOnly(value: Date | string): Date {
  const iso = value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    throw new Error("Date must use YYYY-MM-DD format.");
  }
  return new Date(`${iso}T00:00:00.000Z`);
}

export function formatDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function lastSixMonths(): string[] {
  const [year, month] = cairoCurrentMonth().split("-").map(Number);
  return Array.from({ length: 6 }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 1 - (5 - index), 1));
    return date.toISOString().slice(0, 7);
  });
}
