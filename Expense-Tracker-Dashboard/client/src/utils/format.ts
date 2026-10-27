const money = new Intl.NumberFormat("en-EG", {
  style: "currency",
  currency: "EGP",
  maximumFractionDigits: 2,
});

export const colors = ["#438d6a", "#c98c42", "#557492", "#b9675d", "#5a9b9b", "#8a76a8", "#bd8050", "#648b55"];

export function cairoDateParts(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
}

export function nowMonth() {
  const parts = cairoDateParts();
  return `${parts.find((part) => part.type === "year")?.value}-${parts.find((part) => part.type === "month")?.value}`;
}

export function nowDate() {
  const parts = cairoDateParts();
  return `${parts.find((part) => part.type === "year")?.value}-${parts.find((part) => part.type === "month")?.value}-${parts.find((part) => part.type === "day")?.value}`;
}

export function egp(piastres: number | null | undefined) {
  return money.format((piastres ?? 0) / 100);
}

export function monthLabel(month: string) {
  const [year, value] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("en-EG", { month: "long", year: "numeric" }).format(new Date(year, value - 1, 1));
}

export function shortDate(value: string) {
  return new Intl.DateTimeFormat("en-EG", {
    timeZone: "Africa/Cairo",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

export function parseApiError(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}
